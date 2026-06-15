import { Resolver, Query, Subscription } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { CompanyEntity } from '@gammaray/database'
import { CompaniesService } from './companies.service'
import { CompanyModel } from './company.model'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { SyncBroker } from '../sync/sync.broker'

@Resolver(() => CompanyModel)
@UseGuards(JwtAuthGuard)
export class CompaniesResolver {
  constructor(
    private readonly service: CompaniesService,
    private readonly broker: SyncBroker,
  ) {}

  @Query(() => [CompanyModel])
  async companies(): Promise<CompanyModel[]> {
    return (await this.service.listCompanies()).map(toCompanyModel)
  }

  @Subscription(() => CompanyModel)
  companyUpdated() {
    // Companies are a shared dataset — a single global channel.
    return this.broker.companyAsyncIterator()
  }
}

function toCompanyModel(e: CompanyEntity): CompanyModel {
  const m = new CompanyModel()
  m.id = e.id
  m.name = e.name
  m.version = e.version
  m.updatedAt = e.updatedAt instanceof Date ? e.updatedAt.toISOString() : String(e.updatedAt)
  return m
}
