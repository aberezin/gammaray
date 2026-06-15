import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, EntityManager, In, ObjectLiteral, EntityTarget, Not } from 'typeorm'
import { FieldKind, ConflictStatus, mergeRows, type TableDescriptor, type FieldDescriptor } from '@gammaray/core'
import { RowRevisionEntity } from '@gammaray/database'
import type { ApplyOutcome, RowChangeInput } from '../batch/batch.types'
import { projectToDescriptor } from './project'

// The generic engine for type-A tables: list, existence checks, a descriptor-
// driven create/update/delete applier, plus the revision log, 3-way merge, and
// conflict resolution. One implementation serves every table — flat WholeRow
// tables and revisioned/merge tables (contacts) alike. A new table needs only a
// descriptor + entity + registry line.
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

  // Apply one change to any table. Reference validation (DB ∪ batch) is the batch
  // coordinator's job. Reconciles by version: a revisioned table logs history and
  // attempts a 3-way merge on a version mismatch; a non-revisioned (WholeRow)
  // table simply conflicts on a mismatch.
  async applyRow(
    manager: EntityManager,
    change: RowChangeInput,
    clientId: string,
    descriptor: TableDescriptor,
    entity: EntityTarget<ObjectLiteral>,
  ): Promise<ApplyOutcome> {
    const repo = manager.getRepository(entity)
    const idField = descriptor.identity.field
    const writable = this.writableFields(descriptor)
    const ours: Record<string, unknown> = {}
    for (const f of writable) ours[f.name] = coerce(f, change.data[f.name])

    const revisioned = descriptor.revisioned === true
    const revRepo = revisioned ? manager.getRepository(RowRevisionEntity) : null

    const saveRev = async (row: Record<string, unknown>, status: ConflictStatus) => {
      if (!revRepo) return
      await revRepo.save(
        revRepo.create({
          tableName: descriptor.table,
          rowId: change.id,
          data: projectToDescriptor(descriptor, row),
          version: Number(row.version ?? 0),
          clientId,
          conflictStatus: status,
        }),
      )
    }

    const existing = await repo
      .createQueryBuilder('r')
      .where(`r.${idField} = :id`, { id: change.id })
      .setLock('pessimistic_write')
      .getOne()

    // DELETE
    if (change.op === 'DELETE') {
      if (!existing) return { status: 'APPLIED', row: null }
      if (existing.version !== change.expectedVersion) {
        await saveRev({ ...existing, ...ours, deleted: true, version: existing.version }, ConflictStatus.Detected)
        return { status: 'CONFLICT', serverVersion: existing.version, row: existing }
      }
      const version = existing.version + 1
      await repo.update(change.id, { deleted: true, version })
      const deleted = { ...existing, deleted: true, version }
      await saveRev(deleted, ConflictStatus.None)
      return { status: 'APPLIED', row: deleted, emit: deleted }
    }

    // UPSERT — create
    if (!existing) {
      const created = await repo.save(repo.create({ [idField]: change.id, ...ours, version: 1 }))
      await saveRev(created as Record<string, unknown>, ConflictStatus.None)
      return { status: 'APPLIED', row: created, emit: created }
    }

    // Version mismatch — try a merge (revisioned + mergeable), else conflict.
    if (existing.version !== change.expectedVersion) {
      if (revisioned && !existing.deleted) {
        const base = await this.loadAncestor(manager, descriptor.table, change.id, change.expectedVersion)
        const result = mergeRows(descriptor, base, { [idField]: change.id, ...ours }, projectToDescriptor(descriptor, existing))
        if (result.ok) {
          const merged: Record<string, unknown> = {}
          for (const f of writable) merged[f.name] = coerce(f, result.merged[f.name])
          const version = existing.version + 1
          await repo.update(change.id, { ...merged, version })
          const row = { ...existing, ...merged, version }
          await saveRev(row, ConflictStatus.None)
          return { status: 'APPLIED', row, emit: row }
        }
      }
      await saveRev({ ...existing, ...ours, version: existing.version }, ConflictStatus.Detected)
      return { status: 'CONFLICT', serverVersion: existing.version, row: existing }
    }

    // Fast-forward.
    const version = existing.version + 1
    await repo.update(change.id, { ...ours, version })
    const updated = { ...existing, ...ours, version }
    await saveRev(updated, ConflictStatus.None)
    return { status: 'APPLIED', row: updated, emit: updated }
  }

  // History for a row (newest first), shaped like the old contactRevisions query.
  async getRevisions(table: string, rowId: string): Promise<Record<string, unknown>[]> {
    const rows = await this.dataSource.getRepository(RowRevisionEntity).find({
      where: { tableName: table, rowId },
      order: { createdAt: 'DESC' },
    })
    return rows.map((r) => ({
      id: r.id,
      version: r.version,
      clientId: r.clientId,
      conflictStatus: r.conflictStatus,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      data: JSON.stringify(r.data ?? {}),
    }))
  }

  // Resolve a detected conflict by writing the user's chosen row unconditionally
  // (row lock + version bump, so it serializes rather than re-conflicting), then
  // mark the row's outstanding 'detected' revisions resolved. Returns the
  // resolved row projected to the wire shape.
  async resolveConflict(
    table: string,
    descriptor: TableDescriptor,
    entity: EntityTarget<ObjectLiteral>,
    row: Record<string, unknown>,
    clientId: string,
  ): Promise<Record<string, unknown>> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(entity)
      const revRepo = manager.getRepository(RowRevisionEntity)
      const idField = descriptor.identity.field
      const id = String(row[idField] ?? row.id)

      const existing = await repo
        .createQueryBuilder('r')
        .where(`r.${idField} = :id`, { id })
        .setLock('pessimistic_write')
        .getOneOrFail()

      const writable = this.writableFields(descriptor)
      const data: Record<string, unknown> = {}
      for (const f of writable) data[f.name] = coerce(f, row[f.name])
      const deleted = row.deleted === true
      const version = existing.version + 1

      await repo.update(id, { ...data, deleted, version })
      const resolved = { ...existing, ...data, deleted, version }

      await revRepo.save(
        revRepo.create({
          tableName: table,
          rowId: id,
          data: projectToDescriptor(descriptor, resolved),
          version,
          clientId,
          conflictStatus: ConflictStatus.Resolved,
        }),
      )
      await revRepo
        .createQueryBuilder()
        .update()
        .set({ conflictStatus: ConflictStatus.Resolved })
        .where('table_name = :t AND row_id = :id AND conflict_status = :s', {
          t: table,
          id,
          s: ConflictStatus.Detected,
        })
        .execute()

      return projectToDescriptor(descriptor, resolved)
    })
  }

  // The accepted (non-detected) revision snapshot at a version — the 3-way merge
  // ancestor. Null if never recorded / truncated.
  private async loadAncestor(
    manager: EntityManager,
    table: string,
    rowId: string,
    version: number,
  ): Promise<Record<string, unknown> | null> {
    const rev = await manager.getRepository(RowRevisionEntity).findOne({
      where: { tableName: table, rowId, version, conflictStatus: Not(ConflictStatus.Detected) },
      order: { createdAt: 'DESC' },
    })
    return rev ? (rev.data as Record<string, unknown>) : null
  }

  // Client-writable columns: descriptor fields that aren't the id, aren't
  // read-only (version/timestamps), and aren't virtual (MultiReference).
  private writableFields(descriptor: TableDescriptor): FieldDescriptor[] {
    return descriptor.fields.filter(
      (f) =>
        f.name !== descriptor.identity.field &&
        !f.readOnly &&
        f.kind !== FieldKind.MultiReference,
    )
  }
}

// Coerce a client value to the column's shape so missing/empty values match the
// entity's NOT NULL defaults: string-like → '', reference → null, int → 0,
// boolean → false. (The old bespoke contact applier did this with `str()`.)
function coerce(field: FieldDescriptor, value: unknown): unknown {
  switch (field.kind) {
    case FieldKind.Reference:
      return value === null || value === undefined || value === '' ? null : String(value)
    case FieldKind.Int:
      return value === null || value === undefined ? 0 : Number(value)
    case FieldKind.Boolean:
      return value === true
    default:
      return value === null || value === undefined ? '' : String(value)
  }
}
