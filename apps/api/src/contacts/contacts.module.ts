import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ContactEntity, ContactRevisionEntity, CompanyEntity } from '@gammaray/database'
import { ContactsService } from './contacts.service'
import { ContactsResolver } from './contacts.resolver'
import { SyncModule } from '../sync/sync.module'

@Module({
  imports: [TypeOrmModule.forFeature([ContactEntity, ContactRevisionEntity, CompanyEntity]), SyncModule],
  providers: [ContactsService, ContactsResolver],
  exports: [ContactsService],
})
export class ContactsModule {}
