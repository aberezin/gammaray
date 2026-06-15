import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CategoryEntity } from '@gammaray/database'
import { CategoriesService } from './categories.service'
import { CategoriesResolver } from './categories.resolver'
import { SyncModule } from '../sync/sync.module'

@Module({
  imports: [TypeOrmModule.forFeature([CategoryEntity]), SyncModule],
  providers: [CategoriesService, CategoriesResolver],
  exports: [CategoriesService],
})
export class CategoriesModule {}
