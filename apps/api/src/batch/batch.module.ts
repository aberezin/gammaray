import { Module } from '@nestjs/common'
import { ContactsModule } from '../contacts/contacts.module'
import { CompaniesModule } from '../companies/companies.module'
import { SyncModule } from '../sync/sync.module'
import { BatchService } from './batch.service'
import { BatchResolver } from './batch.resolver'

@Module({
  imports: [ContactsModule, CompaniesModule, SyncModule],
  providers: [BatchService, BatchResolver],
})
export class BatchModule {}
