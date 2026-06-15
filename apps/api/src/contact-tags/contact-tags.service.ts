import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, In, Repository } from 'typeorm'
import { ContactTagEntity } from '@gammaray/database'
import { ApplyOutcome, RowChangeInput } from '../batch/batch.types'

@Injectable()
export class ContactTagsService {
  constructor(
    @InjectRepository(ContactTagEntity)
    private readonly links: Repository<ContactTagEntity>,
  ) {}

  listContactTags(): Promise<ContactTagEntity[]> {
    return this.links.find({ where: { deleted: false } })
  }

  async existingIds(manager: EntityManager, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set()
    const rows = await manager.getRepository(ContactTagEntity).find({
      where: { id: In(ids) },
      select: { id: true },
    })
    return new Set(rows.map((r) => r.id))
  }

  // The join row carries two references (contactId, tagId), but they are
  // validated against DB ∪ batch by the coordinator before this runs, so the
  // applier only reconciles. Links are create/delete in practice.
  async applyContactTagChange(
    manager: EntityManager,
    change: RowChangeInput,
    _clientId: string,
  ): Promise<ApplyOutcome> {
    const repo = manager.getRepository(ContactTagEntity)
    const d = change.data
    const contactId = str(d.contactId)
    const tagId = str(d.tagId)

    const existing = await repo
      .createQueryBuilder('ct')
      .where('ct.id = :id', { id: change.id })
      .setLock('pessimistic_write')
      .getOne()

    if (change.op === 'DELETE') {
      if (!existing) return { status: 'APPLIED', row: null }
      if (existing.version !== change.expectedVersion) {
        return { status: 'CONFLICT', serverVersion: existing.version, row: snapshot(existing) }
      }
      const version = existing.version + 1
      await repo.update(existing.id, { deleted: true, version })
      const deleted = { ...existing, deleted: true, version } as ContactTagEntity
      return { status: 'APPLIED', row: deleted, emit: deleted }
    }

    if (!existing) {
      const created = await repo.save(
        repo.create({ id: change.id, contactId, tagId, version: 1 }),
      )
      return { status: 'APPLIED', row: created, emit: created }
    }

    if (existing.version !== change.expectedVersion) {
      return { status: 'CONFLICT', serverVersion: existing.version, row: snapshot(existing) }
    }

    const version = existing.version + 1
    const updated = { ...existing, contactId, tagId, version } as ContactTagEntity
    await repo.update(existing.id, { contactId, tagId, version })
    return { status: 'APPLIED', row: updated, emit: updated }
  }
}

function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v)
}

function snapshot(ct: ContactTagEntity): Record<string, unknown> {
  return { id: ct.id, contactId: ct.contactId, tagId: ct.tagId, version: ct.version, deleted: ct.deleted }
}
