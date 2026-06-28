import { Injectable } from '@nestjs/common'
import { EntityManager, ObjectLiteral, EntityTarget } from 'typeorm'
import { dependencyOrder, type TableDescriptor } from '@gammaray/core'
import type { ApplyOutcome, RowChangeInput } from '../batch/batch.types'
import { GenericRowService } from './generic-row.service'
import { enabledSchemaTables } from './schema-tables'

export interface RegisteredTable {
  descriptor: TableDescriptor
  entity: EntityTarget<ObjectLiteral>
  apply: (manager: EntityManager, change: RowChangeInput, clientId: string) => Promise<ApplyOutcome>
  existing: (manager: EntityManager, ids: string[]) => Promise<Set<string>>
}

// The single source of truth for which type-A tables exist and how each is read,
// applied, and reference-checked. Reads (rows/rowUpdated), the batch endpoint,
// conflict resolution, and dependency ordering all consult this. Every table —
// flat or revisioned — runs through the generic engine; per-table behavior
// (merge strategy, history) is declared on the descriptor. The set of tables is
// config-selected per app via `enabledSchemaTables()` (GAMMARAY_SCHEMAS); adding
// a table = one entry in its schema list + a descriptor + an entity + a migration.
@Injectable()
export class RowRegistry {
  private readonly tables: Record<string, RegisteredTable>
  readonly order: string[]

  constructor(private readonly generic: GenericRowService) {
    const reg = (descriptor: TableDescriptor, entity: EntityTarget<ObjectLiteral>): RegisteredTable => ({
      descriptor,
      entity,
      apply: (m, c, cid) => this.generic.applyRow(m, c, cid, descriptor, entity),
      existing: (m, ids) => this.generic.existingIds(m, entity, ids),
    })

    this.tables = Object.fromEntries(
      enabledSchemaTables().map(({ descriptor, entity }) => [descriptor.table, reg(descriptor, entity)]),
    )

    this.order = dependencyOrder(Object.values(this.tables).map((t) => t.descriptor))
  }

  get(table: string): RegisteredTable | undefined {
    return this.tables[table]
  }

  has(table: string): boolean {
    return table in this.tables
  }

  all(): RegisteredTable[] {
    return Object.values(this.tables)
  }
}
