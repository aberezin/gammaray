import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository } from 'typeorm'
import { CompanyEntity } from '@gammaray/database'
import { companyDescriptor, mergeRows } from '@gammaray/core'
import { ApplyOutcome, RowChangeInput } from '../batch/batch.types'

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(CompanyEntity)
    private readonly companies: Repository<CompanyEntity>,
  ) {}

  listCompanies(): Promise<CompanyEntity[]> {
    return this.companies.find({ where: { deleted: false }, order: { name: 'ASC' } })
  }

  // Apply one company change in the batch transaction. Companies have no
  // references and no revision log; reconcile is the same Model-A version logic.
  async applyCompanyChange(
    manager: EntityManager,
    change: RowChangeInput,
    _clientId: string,
  ): Promise<ApplyOutcome> {
    const repo = manager.getRepository(CompanyEntity)
    const ours = { id: change.id, name: str(change.data.name) }

    const existing = await repo
      .createQueryBuilder('c')
      .where('c.id = :id', { id: change.id })
      .setLock('pessimistic_write')
      .getOne()

    if (change.op === 'DELETE') {
      if (!existing) return { status: 'APPLIED', row: null }
      if (existing.version !== change.expectedVersion) {
        return { status: 'CONFLICT', serverVersion: existing.version, row: companySnapshot(existing) }
      }
      const version = existing.version + 1
      await repo.update(existing.id, { deleted: true, version })
      const deleted = { ...existing, deleted: true, version } as CompanyEntity
      return { status: 'APPLIED', row: deleted, emit: deleted }
    }

    if (!existing) {
      const created = await repo.save(repo.create({ id: ours.id, name: ours.name, version: 1 }))
      return { status: 'APPLIED', row: created, emit: created }
    }

    if (existing.version !== change.expectedVersion) {
      const result = mergeRows(companyDescriptor, null, ours, companySnapshot(existing))
      if (!result.ok) {
        return { status: 'CONFLICT', serverVersion: existing.version, row: companySnapshot(existing) }
      }
      // WholeRow only reaches here when content already matches — no-op.
      return { status: 'APPLIED', row: existing, emit: existing }
    }

    const version = existing.version + 1
    const updated = { ...existing, name: ours.name, version } as CompanyEntity
    await repo.update(existing.id, { name: ours.name, version })
    return { status: 'APPLIED', row: updated, emit: updated }
  }
}

function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v)
}

function companySnapshot(c: CompanyEntity): Record<string, unknown> {
  return { id: c.id, name: c.name, version: c.version, deleted: c.deleted }
}
