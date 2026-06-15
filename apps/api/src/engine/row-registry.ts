import { Injectable } from '@nestjs/common'
import { EntityManager, ObjectLiteral, EntityTarget } from 'typeorm'
import {
  companyDescriptor,
  contactDescriptor,
  categoryDescriptor,
  tagDescriptor,
  contactTagDescriptor,
  dependencyOrder,
  type TableDescriptor,
} from '@gammaray/core'
import {
  CompanyEntity,
  ContactEntity,
  CategoryEntity,
  TagEntity,
  ContactTagEntity,
} from '@gammaray/database'
import type { ApplyOutcome, RowChangeInput } from '../batch/batch.types'
import { GenericRowService } from './generic-row.service'

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
// (merge strategy, history) is declared on the descriptor. Adding a table = one
// entry here + a descriptor + an entity + a migration.
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

    this.tables = {
      company: reg(companyDescriptor, CompanyEntity),
      category: reg(categoryDescriptor, CategoryEntity),
      tag: reg(tagDescriptor, TagEntity),
      contact_tag: reg(contactTagDescriptor, ContactTagEntity),
      // Contacts is revisioned (DisjointFields merge + history) — declared on the
      // descriptor, handled by the same generic applier.
      contact: reg(contactDescriptor, ContactEntity),
    }

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
