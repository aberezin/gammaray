import { Injectable } from '@nestjs/common'
import { DataSource, EntityManager } from 'typeorm'
import { FieldKind } from '@gammaray/core'
import { RowRegistry } from '../engine/row-registry'
import { projectToDescriptor } from '../engine/project'
import { SyncBroker } from '../sync/sync.broker'
import type { ApplyOutcome, RowChangeInput } from './batch.types'

export interface BatchRowResult {
  table: string
  id: string
  status: ApplyOutcome['status']
  row?: Record<string, unknown> | null
  serverVersion?: number | null
  reason?: string | null
}

interface RefField {
  field: string
  table: string
}

// Applies a batch of row changes atomically. Tables are resolved through the
// RowRegistry (the generic engine), so this code is table-agnostic. Referential
// integrity is validated against DB ∪ batch (so a row may reference another row
// created in the same batch, in any order — including self-references and
// cycles), and confirmed by the DEFERRABLE constraints at commit.
@Injectable()
export class BatchService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly registry: RowRegistry,
    private readonly broker: SyncBroker,
  ) {}

  async pushBatch(changes: RowChangeInput[], clientId: string): Promise<BatchRowResult[]> {
    const results: BatchRowResult[] = []
    const toEmit: Array<{ table: string; row: Record<string, unknown> }> = []

    await this.dataSource.transaction(async (manager) => {
      // Validate FKs at commit, not per statement.
      await manager.query('SET CONSTRAINTS ALL DEFERRED')

      const rejected = await this.validateReferences(manager, changes)

      // Apply parents-first (a nicety for the deferred backstop; correctness is
      // the reference validation above + the deferred constraint at commit).
      const ordered = [...changes].sort((a, b) => this.rank(a.table) - this.rank(b.table))
      for (const change of ordered) {
        const key = `${change.table}:${change.id}`
        const entry = this.registry.get(change.table)
        if (!entry) {
          results.push({ table: change.table, id: change.id, status: 'REJECTED', reason: `unknown table: ${change.table}` })
          continue
        }
        if (rejected.has(key)) {
          results.push({ table: change.table, id: change.id, status: 'REJECTED', reason: rejected.get(key) })
          continue
        }
        const outcome = await entry.apply(manager, change, clientId)
        results.push({
          table: change.table,
          id: change.id,
          status: outcome.status,
          row: clean(outcome.row),
          serverVersion: outcome.serverVersion ?? null,
          reason: outcome.reason ?? null,
        })
        if (outcome.status === 'APPLIED' && outcome.emit) {
          const row = projectToDescriptor(entry.descriptor, clean(outcome.emit) as Record<string, unknown>)
          toEmit.push({ table: change.table, row })
        }
      }
    })

    for (const e of toEmit) this.broker.emitRow(e.table, e.row)
    return results
  }

  // Reject UPSERTs whose references can't be satisfied by DB ∪ batch. Order- and
  // cycle-independent: a target counts as resolvable if it exists in the DB or is
  // any (non-rejected) UPSERT in this batch. A rejected create poisons rows that
  // reference it (fixpoint).
  private async validateReferences(
    manager: EntityManager,
    changes: RowChangeInput[],
  ): Promise<Map<string, string>> {
    const upserts = changes.filter((c) => c.op === 'UPSERT')
    const batchKeys = new Set(upserts.map((c) => `${c.table}:${c.id}`))

    // External (non-batch) reference targets, grouped by referenced table.
    const externalByTable = new Map<string, Set<string>>()
    for (const c of upserts) {
      for (const ref of this.refFields(c.table)) {
        const v = c.data[ref.field]
        if (typeof v === 'string' && v && !batchKeys.has(`${ref.table}:${v}`)) {
          if (!externalByTable.has(ref.table)) externalByTable.set(ref.table, new Set())
          externalByTable.get(ref.table)!.add(v)
        }
      }
    }

    const willExist = new Set(batchKeys)
    for (const [table, ids] of externalByTable) {
      const present = (await this.registry.get(table)?.existing(manager, [...ids])) ?? new Set()
      for (const id of present) willExist.add(`${table}:${id}`)
    }

    const rejected = new Map<string, string>()
    let changed = true
    while (changed) {
      changed = false
      for (const c of upserts) {
        const key = `${c.table}:${c.id}`
        if (rejected.has(key)) continue
        for (const ref of this.refFields(c.table)) {
          const v = c.data[ref.field]
          if (typeof v === 'string' && v && !willExist.has(`${ref.table}:${v}`)) {
            rejected.set(key, `missing reference ${ref.table}:${v}`)
            willExist.delete(key)
            changed = true
            break
          }
        }
      }
    }
    return rejected
  }

  private refFields(table: string): RefField[] {
    const descriptor = this.registry.get(table)?.descriptor
    if (!descriptor) return []
    return descriptor.fields
      .filter((f) => f.kind === FieldKind.Reference && f.references)
      .map((f) => ({ field: f.name, table: f.references!.collection }))
  }

  private rank(table: string): number {
    const i = this.registry.order.indexOf(table)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
}

// Normalize to a plain JSON object (Dates → ISO strings, no entity internals).
function clean(row: object | null | undefined): Record<string, unknown> | null {
  if (row === null || row === undefined) return null
  return JSON.parse(JSON.stringify(row)) as Record<string, unknown>
}
