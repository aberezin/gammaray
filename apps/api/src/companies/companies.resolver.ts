import { Resolver, Query } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { CompanyEntity } from '@gammaray/database'
import { CompaniesService } from './companies.service'
import { CompanyModel } from './company.model'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'

@Resolver(() => CompanyModel)
@UseGuards(JwtAuthGuard)
export class CompaniesResolver {
  constructor(private readonly service: CompaniesService) {}

  @Query(() => [CompanyModel])
  async companies(): Promise<CompanyModel[]> {
    return (await this.service.listCompanies()).map(toCompanyModel)
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
