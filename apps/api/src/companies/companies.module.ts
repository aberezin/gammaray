import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CompanyEntity } from '@gammaray/database'
import { CompaniesService } from './companies.service'
import { CompaniesResolver } from './companies.resolver'
import { SyncModule } from '../sync/sync.module'

@Module({
  imports: [TypeOrmModule.forFeature([CompanyEntity]), SyncModule],
  providers: [CompaniesService, CompaniesResolver],
  exports: [CompaniesService],
})
export class CompaniesModule {}
