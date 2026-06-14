import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ContactEntity, ContactRevisionEntity } from '@gammaray/database'
import { ContactsService } from './contacts.service'
import { ContactsResolver } from './contacts.resolver'

@Module({
  imports: [TypeOrmModule.forFeature([ContactEntity, ContactRevisionEntity])],
  providers: [ContactsService, ContactsResolver],
})
export class ContactsModule {}
