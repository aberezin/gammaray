import { Module } from '@nestjs/common'
import { ContactsModule } from '../contacts/contacts.module'
import { CompaniesModule } from '../companies/companies.module'
import { CategoriesModule } from '../categories/categories.module'
import { TagsModule } from '../tags/tags.module'
import { ContactTagsModule } from '../contact-tags/contact-tags.module'
import { SyncModule } from '../sync/sync.module'
import { BatchService } from './batch.service'
import { BatchResolver } from './batch.resolver'

@Module({
  imports: [
    ContactsModule,
    CompaniesModule,
    CategoriesModule,
    TagsModule,
    ContactTagsModule,
    SyncModule,
  ],
  providers: [BatchService, BatchResolver],
})
export class BatchModule {}
