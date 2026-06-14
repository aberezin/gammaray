import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { ContactEntity, ContactRevisionEntity } from '@gammaray/database'
import { ConflictStatus } from '@gammaray/core'
import { ContactInput } from './contact.model'

export interface ContactPushResult {
  conflict: boolean
  contact: ContactEntity | null
  serverVersion?: number
  serverData?: Record<string, unknown>
}

// Contacts are a shared, globally-visible dataset — no per-user scoping, no
// foreign keys. Read + Create implemented; Update/Delete come next.
@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(ContactRevisionEntity)
    private readonly revisions: Repository<ContactRevisionEntity>,
    private readonly dataSource: DataSource,
  ) {}

  listContacts(): Promise<ContactEntity[]> {
    return this.contacts.find({ order: { updatedAt: 'DESC' } })
  }

  getContact(id: string): Promise<ContactEntity | null> {
    return this.contacts.findOneBy({ id })
  }

  getContactRevisions(contactId: string): Promise<ContactRevisionEntity[]> {
    return this.revisions.find({
      where: { contactId },
      order: { createdAt: 'DESC' },
    })
  }

  // Create + Update. A new id inserts at version 1. An existing id is reconciled
  // with optimistic concurrency (Model A): if the row is still at expectedVersion
  // it fast-forwards; otherwise it diverged. The default WholeRow merge strategy
  // treats any divergence as a conflict (DisjointFields auto-merge comes later).
  async pushContact(
    input: ContactInput,
    expectedVersion: number,
    clientId: string,
  ): Promise<ContactPushResult> {
    return this.dataSource.transaction(async (manager) => {
      const contactRepo = manager.getRepository(ContactEntity)
      const revRepo = manager.getRepository(ContactRevisionEntity)

      // Row-level lock so concurrent pushes to the same row serialize.
      const existing = input.id
        ? await contactRepo
            .createQueryBuilder('c')
            .where('c.id = :id', { id: input.id })
            .setLock('pessimistic_write')
            .getOne()
        : null

      // Create: brand-new row (a delete of a non-existent row is a no-op).
      if (!existing) {
        if (input.deleted) return { conflict: false, contact: null }
        const created = await contactRepo.save(
          contactRepo.create({
            id: input.id,
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email,
            phone: input.phone,
            version: 1,
          }),
        )
        await revRepo.save(
          revRepo.create({
            contactId: created.id,
            data: snapshot(created),
            version: 1,
            clientId,
            conflictStatus: ConflictStatus.None,
          }),
        )
        return { conflict: false, contact: created }
      }

      // WholeRow strategy — any diverged version is a conflict, whether the push
      // is an edit or a delete. (This is the delete-vs-edit conflict path too.)
      if (existing.version !== expectedVersion) {
        await revRepo.save(
          revRepo.create({
            contactId: existing.id,
            data: { ...incoming(input), deleted: input.deleted, version: existing.version },
            version: existing.version,
            clientId,
            conflictStatus: ConflictStatus.Detected,
          }),
        )
        return {
          conflict: true,
          contact: null,
          serverVersion: existing.version,
          serverData: snapshot(existing),
        }
      }

      // Fast-forward: apply the delete or the edit.
      const nextVersion = existing.version + 1
      if (input.deleted) {
        await contactRepo.update(existing.id, { deleted: true, version: nextVersion })
        const deleted = { ...existing, deleted: true, version: nextVersion } as ContactEntity
        await revRepo.save(
          revRepo.create({
            contactId: existing.id,
            data: snapshot(deleted),
            version: nextVersion,
            clientId,
            conflictStatus: ConflictStatus.None,
          }),
        )
        return { conflict: false, contact: deleted }
      }

      await contactRepo.update(existing.id, {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        version: nextVersion,
      })
      const updated = { ...existing, ...incoming(input), version: nextVersion } as ContactEntity
      await revRepo.save(
        revRepo.create({
          contactId: existing.id,
          data: snapshot(updated),
          version: nextVersion,
          clientId,
          conflictStatus: ConflictStatus.None,
        }),
      )
      return { conflict: false, contact: updated }
    })
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

function incoming(input: ContactInput): Record<string, unknown> {
  return {
    id: input.id,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
  }
}

function snapshot(c: ContactEntity): Record<string, unknown> {
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    version: c.version,
    deleted: c.deleted,
  }
}
