import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ContactEntity, ContactRevisionEntity } from '@gammaray/database'
import { ContactsService } from './contacts.service'
import { ContactsResolver } from './contacts.resolver'
import { SyncModule } from '../sync/sync.module'

@Module({
  imports: [TypeOrmModule.forFeature([ContactEntity, ContactRevisionEntity]), SyncModule],
  providers: [ContactsService, ContactsResolver],
})
export class ContactsModule {}
