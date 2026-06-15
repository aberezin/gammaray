import { Resolver, Query, Subscription } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { TagEntity } from '@gammaray/database'
import { TagsService } from './tags.service'
import { TagModel } from './tag.model'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { SyncBroker } from '../sync/sync.broker'

@Resolver(() => TagModel)
@UseGuards(JwtAuthGuard)
export class TagsResolver {
  constructor(
    private readonly service: TagsService,
    private readonly broker: SyncBroker,
  ) {}

  @Query(() => [TagModel])
  async tags(): Promise<TagModel[]> {
    return (await this.service.listTags()).map(toTagModel)
  }

  @Subscription(() => TagModel)
  tagUpdated() {
    return this.broker.tagAsyncIterator()
  }
}

export function toTagModel(e: TagEntity): TagModel {
  const m = new TagModel()
  m.id = e.id
  m.name = e.name
  m.version = e.version
  m.deleted = e.deleted
  m.updatedAt = e.updatedAt instanceof Date ? e.updatedAt.toISOString() : String(e.updatedAt)
  return m
}
