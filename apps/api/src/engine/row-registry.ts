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
import { ContactsService } from '../contacts/contacts.service'

export interface RegisteredTable {
  descriptor: TableDescriptor
  entity: EntityTarget<ObjectLiteral>
  apply: (manager: EntityManager, change: RowChangeInput, clientId: string) => Promise<ApplyOutcome>
  existing: (manager: EntityManager, ids: string[]) => Promise<Set<string>>
}

// The single source of truth for which type-A tables exist and how each is read,
// applied, and reference-checked. Reads (rows/rowUpdated), the batch endpoint,
// and dependency ordering all consult this. Flat tables use the generic applier;
// contacts plugs in its bespoke applier (revision log + 3-way merge). Adding a
// flat table = one entry here + a descriptor + an entity + a migration.
@Injectable()
export class RowRegistry {
  private readonly tables: Record<string, RegisteredTable>
  readonly order: string[]

  constructor(
    private readonly generic: GenericRowService,
    private readonly contacts: ContactsService,
  ) {
    const flat = (descriptor: TableDescriptor, entity: EntityTarget<ObjectLiteral>): RegisteredTable => ({
      descriptor,
      entity,
      apply: (m, c) => this.generic.applyFlat(m, c, descriptor, entity),
      existing: (m, ids) => this.generic.existingIds(m, entity, ids),
    })

    this.tables = {
      company: flat(companyDescriptor, CompanyEntity),
      category: flat(categoryDescriptor, CategoryEntity),
      tag: flat(tagDescriptor, TagEntity),
      contact_tag: flat(contactTagDescriptor, ContactTagEntity),
      // Contacts keep a bespoke applier (revision log + 3-way merge + conflicts),
      // but read/list and existence checks ride the generic engine.
      contact: {
        descriptor: contactDescriptor,
        entity: ContactEntity,
        apply: (m, c, cid) => this.contacts.applyContactChange(m, c, cid),
        existing: (m, ids) => this.generic.existingIds(m, ContactEntity, ids),
      },
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
