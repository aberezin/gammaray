import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, In, Repository } from 'typeorm'
import { TagEntity } from '@gammaray/database'
import { ApplyOutcome, RowChangeInput } from '../batch/batch.types'

@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(TagEntity)
    private readonly tags: Repository<TagEntity>,
  ) {}

  listTags(): Promise<TagEntity[]> {
    return this.tags.find({ where: { deleted: false }, order: { name: 'ASC' } })
  }

  async existingIds(manager: EntityManager, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set()
    const rows = await manager.getRepository(TagEntity).find({
      where: { id: In(ids) },
      select: { id: true },
    })
    return new Set(rows.map((r) => r.id))
  }

  // Flat applier (no references). Reference validation, where relevant, is the
  // batch coordinator's job; tags have none.
  async applyTagChange(
    manager: EntityManager,
    change: RowChangeInput,
    _clientId: string,
  ): Promise<ApplyOutcome> {
    const repo = manager.getRepository(TagEntity)
    const name = str(change.data.name)

    const existing = await repo
      .createQueryBuilder('t')
      .where('t.id = :id', { id: change.id })
      .setLock('pessimistic_write')
      .getOne()

    if (change.op === 'DELETE') {
      if (!existing) return { status: 'APPLIED', row: null }
      if (existing.version !== change.expectedVersion) {
        return { status: 'CONFLICT', serverVersion: existing.version, row: snapshot(existing) }
      }
      const version = existing.version + 1
      await repo.update(existing.id, { deleted: true, version })
      const deleted = { ...existing, deleted: true, version } as TagEntity
      return { status: 'APPLIED', row: deleted, emit: deleted }
    }

    if (!existing) {
      const created = await repo.save(repo.create({ id: change.id, name, version: 1 }))
      return { status: 'APPLIED', row: created, emit: created }
    }

    if (existing.version !== change.expectedVersion) {
      return { status: 'CONFLICT', serverVersion: existing.version, row: snapshot(existing) }
    }

    const version = existing.version + 1
    const updated = { ...existing, name, version } as TagEntity
    await repo.update(existing.id, { name, version })
    return { status: 'APPLIED', row: updated, emit: updated }
  }
}

function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v)
}

function snapshot(t: TagEntity): Record<string, unknown> {
  return { id: t.id, name: t.name, version: t.version, deleted: t.deleted }
}
