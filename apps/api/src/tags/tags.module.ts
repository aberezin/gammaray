import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TagEntity } from '@gammaray/database'
import { TagsService } from './tags.service'
import { TagsResolver } from './tags.resolver'
import { SyncModule } from '../sync/sync.module'

@Module({
  imports: [TypeOrmModule.forFeature([TagEntity]), SyncModule],
  providers: [TagsService, TagsResolver],
  exports: [TagsService],
})
export class TagsModule {}
