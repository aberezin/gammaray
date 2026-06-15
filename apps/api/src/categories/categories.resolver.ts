import { Resolver, Query, Subscription } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { CategoryEntity } from '@gammaray/database'
import { CategoriesService } from './categories.service'
import { CategoryModel } from './category.model'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { SyncBroker } from '../sync/sync.broker'

@Resolver(() => CategoryModel)
@UseGuards(JwtAuthGuard)
export class CategoriesResolver {
  constructor(
    private readonly service: CategoriesService,
    private readonly broker: SyncBroker,
  ) {}

  @Query(() => [CategoryModel])
  async categories(): Promise<CategoryModel[]> {
    return (await this.service.listCategories()).map(toCategoryModel)
  }

  @Subscription(() => CategoryModel)
  categoryUpdated() {
    return this.broker.categoryAsyncIterator()
  }
}

export function toCategoryModel(e: CategoryEntity): CategoryModel {
  const m = new CategoryModel()
  m.id = e.id
  m.name = e.name
  m.parentId = e.parentId ?? null
  m.version = e.version
  m.deleted = e.deleted
  m.updatedAt = e.updatedAt instanceof Date ? e.updatedAt.toISOString() : String(e.updatedAt)
  return m
}
