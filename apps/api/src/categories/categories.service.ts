import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, In, Repository } from 'typeorm'
import { CategoryEntity } from '@gammaray/database'
import { ApplyOutcome, RowChangeInput } from '../batch/batch.types'

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(CategoryEntity)
    private readonly categories: Repository<CategoryEntity>,
  ) {}

  listCategories(): Promise<CategoryEntity[]> {
    return this.categories.find({ where: { deleted: false }, order: { name: 'ASC' } })
  }

  // Which of the given ids exist (used by the batch coordinator to validate
  // references against the DB ∪ batch). Self-references are validated this way.
  async existingIds(manager: EntityManager, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set()
    const rows = await manager.getRepository(CategoryEntity).find({
      where: { id: In(ids) },
      select: { id: true },
    })
    return new Set(rows.map((r) => r.id))
  }

  // Reference validation is handled by the batch coordinator (DB ∪ batch), so the
  // applier just reconciles the row. No revision log for categories.
  async applyCategoryChange(
    manager: EntityManager,
    change: RowChangeInput,
    _clientId: string,
  ): Promise<ApplyOutcome> {
    const repo = manager.getRepository(CategoryEntity)
    const d = change.data
    const ours = {
      id: change.id,
      name: str(d.name),
      parentId: (d.parentId as string | null | undefined) ?? null,
    }

    const existing = await repo
      .createQueryBuilder('c')
      .where('c.id = :id', { id: change.id })
      .setLock('pessimistic_write')
      .getOne()

    if (change.op === 'DELETE') {
      if (!existing) return { status: 'APPLIED', row: null }
      if (existing.version !== change.expectedVersion) {
        return { status: 'CONFLICT', serverVersion: existing.version, row: snapshot(existing) }
      }
      const version = existing.version + 1
      await repo.update(existing.id, { deleted: true, version })
      const deleted = { ...existing, deleted: true, version } as CategoryEntity
      return { status: 'APPLIED', row: deleted, emit: deleted }
    }

    if (!existing) {
      const created = await repo.save(
        repo.create({ id: ours.id, name: ours.name, parentId: ours.parentId, version: 1 }),
      )
      return { status: 'APPLIED', row: created, emit: created }
    }

    if (existing.version !== change.expectedVersion) {
      return { status: 'CONFLICT', serverVersion: existing.version, row: snapshot(existing) }
    }

    const version = existing.version + 1
    const updated = { ...existing, name: ours.name, parentId: ours.parentId, version } as CategoryEntity
    await repo.update(existing.id, { name: ours.name, parentId: ours.parentId, version })
    return { status: 'APPLIED', row: updated, emit: updated }
  }
}

function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v)
}

function snapshot(c: CategoryEntity): Record<string, unknown> {
  return { id: c.id, name: c.name, parentId: c.parentId ?? null, version: c.version, deleted: c.deleted }
}
