import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ContactTagEntity } from '@gammaray/database'
import { ContactTagsService } from './contact-tags.service'
import { ContactTagsResolver } from './contact-tags.resolver'
import { SyncModule } from '../sync/sync.module'

@Module({
  imports: [TypeOrmModule.forFeature([ContactTagEntity]), SyncModule],
  providers: [ContactTagsService, ContactTagsResolver],
  exports: [ContactTagsService],
})
export class ContactTagsModule {}
