import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CompanyEntity } from '@gammaray/database'

// Read-only lookup for this increment — companies are seeded; in-app company
// CRUD is a later rung.
@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(CompanyEntity)
    private readonly companies: Repository<CompanyEntity>,
  ) {}

  listCompanies(): Promise<CompanyEntity[]> {
    return this.companies.find({ where: { deleted: false }, order: { name: 'ASC' } })
  }
}
