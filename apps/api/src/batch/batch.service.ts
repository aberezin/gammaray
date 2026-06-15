import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import {
  contactDescriptor,
  companyDescriptor,
  dependencyOrder,
  type TableDescriptor,
} from '@gammaray/core'
import { ContactsService } from '../contacts/contacts.service'
import { CompaniesService } from '../companies/companies.service'
import { SyncBroker } from '../sync/sync.broker'
import { ContactModel } from '../contacts/contact.model'
import { CompanyModel } from '../companies/company.model'
import type { ApplyOutcome, RowChangeInput } from './batch.types'

interface RegistryEntry {
  descriptor: TableDescriptor
  apply: (
    manager: import('typeorm').EntityManager,
    change: RowChangeInput,
    clientId: string,
  ) => Promise<ApplyOutcome>
  emit: (row: Record<string, unknown>) => void
}

export interface BatchRowResult {
  table: string
  id: string
  status: ApplyOutcome['status']
  row?: Record<string, unknown> | null
  serverVersion?: number | null
  reason?: string | null
}

// Applies a batch of row changes atomically. The FK constraints are DEFERRABLE
// (validated at commit), so the only ordering needed is processing parent tables
// before child tables — so an in-batch parent exists when a child's reference is
// validated. Conflicts/rejections are isolated and reported, not aborting.
@Injectable()
export class BatchService {
  private readonly registry: Record<string, RegistryEntry>
  private readonly tableOrder: string[]

  constructor(
    private readonly dataSource: DataSource,
    private readonly contacts: ContactsService,
    private readonly companies: CompaniesService,
    private readonly broker: SyncBroker,
  ) {
    this.registry = {
      company: {
        descriptor: companyDescriptor,
        apply: (m, c, cid) => this.companies.applyCompanyChange(m, c, cid),
        emit: (row) => this.broker.emitCompany(row as unknown as CompanyModel),
      },
      contact: {
        descriptor: contactDescriptor,
        apply: (m, c, cid) => this.contacts.applyContactChange(m, c, cid),
        emit: (row) => this.broker.emitContact(row as unknown as ContactModel),
      },
    }
    this.tableOrder = dependencyOrder([companyDescriptor, contactDescriptor])
  }

  async pushBatch(changes: RowChangeInput[], clientId: string): Promise<BatchRowResult[]> {
    // Parents before children, so an in-batch parent is present when a child's
    // reference is validated within the transaction.
    const ordered = [...changes].sort(
      (a, b) => this.rank(a.table) - this.rank(b.table),
    )

    const results: BatchRowResult[] = []
    const toEmit: Array<{ table: string; row: Record<string, unknown> }> = []

    await this.dataSource.transaction(async (manager) => {
      // Validate FKs at commit, not per statement.
      await manager.query('SET CONSTRAINTS ALL DEFERRED')

      for (const change of ordered) {
        const entry = this.registry[change.table]
        if (!entry) {
          results.push({ table: change.table, id: change.id, status: 'REJECTED', reason: `unknown table: ${change.table}` })
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
          toEmit.push({ table: change.table, row: clean(outcome.emit)! })
        }
      }
    })

    // Broadcast applied rows after the batch commits.
    for (const e of toEmit) this.registry[e.table]?.emit(e.row)

    return results
  }

  private rank(table: string): number {
    const i = this.tableOrder.indexOf(table)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
}

// Normalize to a plain JSON object (Dates → ISO strings, no entity internals).
function clean(row: object | null | undefined): Record<string, unknown> | null {
  if (row === null || row === undefined) return null
  return JSON.parse(JSON.stringify(row)) as Record<string, unknown>
}
