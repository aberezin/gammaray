import { Resolver, Query, Subscription } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { ContactTagEntity } from '@gammaray/database'
import { ContactTagsService } from './contact-tags.service'
import { ContactTagModel } from './contact-tag.model'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { SyncBroker } from '../sync/sync.broker'

@Resolver(() => ContactTagModel)
@UseGuards(JwtAuthGuard)
export class ContactTagsResolver {
  constructor(
    private readonly service: ContactTagsService,
    private readonly broker: SyncBroker,
  ) {}

  @Query(() => [ContactTagModel])
  async contactTags(): Promise<ContactTagModel[]> {
    return (await this.service.listContactTags()).map(toContactTagModel)
  }

  @Subscription(() => ContactTagModel)
  contactTagUpdated() {
    return this.broker.contactTagAsyncIterator()
  }
}

export function toContactTagModel(e: ContactTagEntity): ContactTagModel {
  const m = new ContactTagModel()
  m.id = e.id
  m.contactId = e.contactId
  m.tagId = e.tagId
  m.version = e.version
  m.deleted = e.deleted
  m.updatedAt = e.updatedAt instanceof Date ? e.updatedAt.toISOString() : String(e.updatedAt)
  return m
}
