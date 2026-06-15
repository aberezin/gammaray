import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, EntityManager, In, ObjectLiteral, EntityTarget } from 'typeorm'
import { FieldKind, type TableDescriptor } from '@gammaray/core'
import type { ApplyOutcome, RowChangeInput } from '../batch/batch.types'
import { projectToDescriptor } from './project'

// The generic engine for flat type-A tables: list, existence checks, and a
// descriptor-driven create/update/delete applier with optimistic-version
// (WholeRow) reconciliation. One implementation replaces the per-table services
// for companies/categories/tags/contact_tags — a new flat table needs only a
// descriptor + entity + registry line. (Tables that need a revision log or
// 3-way merge — contacts — keep a bespoke applier.)
@Injectable()
export class GenericRowService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // Non-deleted rows for a table, projected to the descriptor's wire shape.
  async listRows(descriptor: TableDescriptor, entity: EntityTarget<ObjectLiteral>): Promise<Record<string, unknown>[]> {
    const rows = await this.dataSource.getRepository(entity).find({ where: { deleted: false } })
    return rows.map((r) => projectToDescriptor(descriptor, r as Record<string, unknown>))
  }

  // Which of the given ids exist (used by the batch coordinator to validate
  // references against DB ∪ batch).
  async existingIds(
    manager: EntityManager,
    entity: EntityTarget<ObjectLiteral>,
    ids: string[],
  ): Promise<Set<string>> {
    if (ids.length === 0) return new Set()
    const rows = await manager.getRepository(entity).find({ where: { id: In(ids) }, select: { id: true } })
    return new Set(rows.map((r) => r.id as string))
  }

  // Apply one change to a flat table. Reference validation (DB ∪ batch) is the
  // batch coordinator's job; this just reconciles the row by version.
  async applyFlat(
    manager: EntityManager,
    change: RowChangeInput,
    descriptor: TableDescriptor,
    entity: EntityTarget<ObjectLiteral>,
  ): Promise<ApplyOutcome> {
    const repo = manager.getRepository(entity)
    const idField = descriptor.identity.field
    const writable = this.writableFields(descriptor)
    const data: Record<string, unknown> = {}
    for (const name of writable) data[name] = change.data[name] ?? null

    const existing = await repo
      .createQueryBuilder('r')
      .where(`r.${idField} = :id`, { id: change.id })
      .setLock('pessimistic_write')
      .getOne()

    if (change.op === 'DELETE') {
      if (!existing) return { status: 'APPLIED', row: null }
      if (existing.version !== change.expectedVersion) {
        return { status: 'CONFLICT', serverVersion: existing.version, row: existing }
      }
      const version = existing.version + 1
      await repo.update(change.id, { deleted: true, version })
      const deleted = { ...existing, deleted: true, version }
      return { status: 'APPLIED', row: deleted, emit: deleted }
    }

    if (!existing) {
      const created = await repo.save(repo.create({ [idField]: change.id, ...data, version: 1 }))
      return { status: 'APPLIED', row: created, emit: created }
    }

    if (existing.version !== change.expectedVersion) {
      return { status: 'CONFLICT', serverVersion: existing.version, row: existing }
    }

    const version = existing.version + 1
    const updated = { ...existing, ...data, version }
    await repo.update(change.id, { ...data, version })
    return { status: 'APPLIED', row: updated, emit: updated }
  }

  // Client-writable columns: descriptor fields that aren't the id, aren't
  // read-only (version/timestamps), and aren't virtual (MultiReference).
  private writableFields(descriptor: TableDescriptor): string[] {
    return descriptor.fields
      .filter(
        (f) =>
          f.name !== descriptor.identity.field &&
          !f.readOnly &&
          f.kind !== FieldKind.MultiReference,
      )
      .map((f) => f.name)
  }
}
