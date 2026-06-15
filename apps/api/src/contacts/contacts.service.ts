import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, EntityManager, Repository, Not } from 'typeorm'
import { ContactEntity, ContactRevisionEntity } from '@gammaray/database'
import { ConflictStatus, contactDescriptor, mergeRows } from '@gammaray/core'
import { ContactInput } from './contact.model'
import { ApplyOutcome, RowChangeInput } from '../batch/batch.types'

// Contacts are a shared, globally-visible dataset — no per-user scoping. Writes
// go through applyContactChange (driven by the batch endpoint); resolution has
// its own mutation.
@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(ContactRevisionEntity)
    private readonly revisions: Repository<ContactRevisionEntity>,
    private readonly dataSource: DataSource,
  ) {}

  getContactRevisions(contactId: string): Promise<ContactRevisionEntity[]> {
    return this.revisions.find({
      where: { contactId },
      order: { createdAt: 'DESC' },
    })
  }

  // Apply one contact change against the given transaction manager (no tx of its
  // own — the batch coordinator owns it). Reconciles per the Model-A version
  // rules + the table's merge strategy, validates the company reference, and
  // records a revision. This is the single source of contact write logic.
  async applyContactChange(
    manager: EntityManager,
    change: RowChangeInput,
    clientId: string,
  ): Promise<ApplyOutcome> {
    const contactRepo = manager.getRepository(ContactEntity)
    const revRepo = manager.getRepository(ContactRevisionEntity)

    const d = change.data
    const ours = {
      id: change.id,
      firstName: str(d.firstName),
      lastName: str(d.lastName),
      email: str(d.email),
      phone: str(d.phone),
      companyId: (d.companyId as string | null | undefined) ?? null,
    }

    // Row-level lock so concurrent writes to the same row serialize.
    const existing = await contactRepo
      .createQueryBuilder('c')
      .where('c.id = :id', { id: change.id })
      .setLock('pessimistic_write')
      .getOne()

    const recordDetected = (server: ContactEntity) =>
      revRepo.save(
        revRepo.create({
          contactId: server.id,
          data: { ...ours, deleted: change.op === 'DELETE', version: server.version },
          version: server.version,
          clientId,
          conflictStatus: ConflictStatus.Detected,
        }),
      )
    const saveRev = (row: ContactEntity) =>
      revRepo.save(
        revRepo.create({
          contactId: row.id,
          data: snapshot(row),
          version: row.version,
          clientId,
          conflictStatus: ConflictStatus.None,
        }),
      )

    // DELETE
    if (change.op === 'DELETE') {
      if (!existing) return { status: 'APPLIED', row: null }
      if (existing.version !== change.expectedVersion) {
        await recordDetected(existing)
        return { status: 'CONFLICT', serverVersion: existing.version, row: snapshot(existing) }
      }
      const version = existing.version + 1
      await contactRepo.update(existing.id, { deleted: true, version })
      const deleted = { ...existing, deleted: true, version } as ContactEntity
      await saveRev(deleted)
      return { status: 'APPLIED', row: deleted, emit: deleted }
    }

    // UPSERT — reference validation (incl. self-refs/cycles) is done by the batch
    // coordinator against DB ∪ batch, so the applier just reconciles the row.
    if (!existing) {
      const created = await contactRepo.save(contactRepo.create({ ...ours, version: 1 }))
      await saveRev(created)
      return { status: 'APPLIED', row: created, emit: created }
    }

    if (existing.version !== change.expectedVersion) {
      // A delete on the server side can't be field-merged — surface it.
      if (existing.deleted) {
        await recordDetected(existing)
        return { status: 'CONFLICT', serverVersion: existing.version, row: snapshot(existing) }
      }
      const base = await loadBaseSnapshot(revRepo, existing.id, change.expectedVersion)
      const result = mergeRows(contactDescriptor, base, ours, snapshot(existing))
      if (!result.ok) {
        await recordDetected(existing)
        return { status: 'CONFLICT', serverVersion: existing.version, row: snapshot(existing) }
      }
      const m = result.merged
      const version = existing.version + 1
      const merged = {
        ...existing,
        firstName: str(m.firstName),
        lastName: str(m.lastName),
        email: str(m.email),
        phone: str(m.phone),
        companyId: (m.companyId ?? null) as string | null,
        version,
      } as ContactEntity
      await contactRepo.update(existing.id, {
        firstName: merged.firstName,
        lastName: merged.lastName,
        email: merged.email,
        phone: merged.phone,
        companyId: merged.companyId,
        version,
      })
      await saveRev(merged)
      return { status: 'APPLIED', row: merged, emit: merged }
    }

    // Fast-forward.
    const version = existing.version + 1
    const updated = { ...existing, ...ours, version } as ContactEntity
    await contactRepo.update(existing.id, {
      firstName: ours.firstName,
      lastName: ours.lastName,
      email: ours.email,
      phone: ours.phone,
      companyId: ours.companyId,
      version,
    })
    await saveRev(updated)
    return { status: 'APPLIED', row: updated, emit: updated }
  }

  // Resolve a detected conflict by writing the user's chosen row. Unconditional
  // (row lock, version bump) so it serializes rather than re-conflicting, and it
  // marks the row's outstanding 'detected' revisions as resolved.
  async resolveContactConflict(input: ContactInput, clientId: string): Promise<ContactEntity> {
    return this.dataSource.transaction(async (manager) => {
      const contactRepo = manager.getRepository(ContactEntity)
      const revRepo = manager.getRepository(ContactRevisionEntity)

      const existing = await contactRepo
        .createQueryBuilder('c')
        .where('c.id = :id', { id: input.id })
        .setLock('pessimistic_write')
        .getOneOrFail()

      const nextVersion = existing.version + 1
      // The chosen side may be a deletion (accept) or not (resurrect).
      await contactRepo.update(existing.id, {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        companyId: input.companyId ?? null,
        deleted: input.deleted,
        version: nextVersion,
      })
      const resolved = {
        ...existing,
        ...incoming(input),
        deleted: input.deleted,
        version: nextVersion,
      } as ContactEntity

      await revRepo.save(
        revRepo.create({
          contactId: existing.id,
          data: snapshot(resolved),
          version: nextVersion,
          clientId,
          conflictStatus: ConflictStatus.Resolved,
        }),
      )
      await revRepo
        .createQueryBuilder()
        .update()
        .set({ conflictStatus: ConflictStatus.Resolved })
        .where('contactId = :id AND conflictStatus = :s', { id: existing.id, s: ConflictStatus.Detected })
        .execute()

      return resolved
    })
  }
}

// The accepted (non-detected) revision snapshot at a given version — the common
// ancestor for a 3-way merge. Null if it's been truncated/never recorded.
async function loadBaseSnapshot(
  revRepo: Repository<ContactRevisionEntity>,
  contactId: string,
  version: number,
): Promise<Record<string, unknown> | null> {
  const rev = await revRepo.findOne({
    where: { contactId, version, conflictStatus: Not(ConflictStatus.Detected) },
    order: { createdAt: 'DESC' },
  })
  return rev ? (rev.data as Record<string, unknown>) : null
}

function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v)
}

function incoming(input: ContactInput): Record<string, unknown> {
  return {
    id: input.id,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    companyId: input.companyId ?? null,
  }
}

function snapshot(c: ContactEntity): Record<string, unknown> {
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    companyId: c.companyId ?? null,
    version: c.version,
    deleted: c.deleted,
  }
}
