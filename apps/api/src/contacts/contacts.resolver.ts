import { Resolver, Query, Mutation, Args } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { ContactEntity, ContactRevisionEntity } from '@gammaray/database'
import { contactDescriptor } from '@gammaray/core'
import { ContactsService } from './contacts.service'
import { ContactModel, ContactRevisionModel, ContactInput } from './contact.model'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { SyncBroker } from '../sync/sync.broker'
import { projectToDescriptor } from '../engine/project'

// Contacts read/list live through the generic engine (rows/rowUpdated). What
// stays bespoke here is the revision history and conflict resolution — the parts
// the generic flat engine doesn't (yet) cover.
@Resolver(() => ContactModel)
@UseGuards(JwtAuthGuard)
export class ContactsResolver {
  constructor(
    private readonly service: ContactsService,
    private readonly broker: SyncBroker,
  ) {}

  @Query(() => [ContactRevisionModel])
  async contactRevisions(
    @Args('contactId') contactId: string,
  ): Promise<ContactRevisionModel[]> {
    return (await this.service.getContactRevisions(contactId)).map(toContactRevisionModel)
  }

  @Mutation(() => ContactModel)
  async resolveContactConflict(
    @Args('input') input: ContactInput,
    @Args('clientId') clientId: string,
  ): Promise<ContactModel> {
    const resolved = toContactModel(await this.service.resolveContactConflict(input, clientId))
    this.broker.emitRow('contact', projectToDescriptor(contactDescriptor, resolved as unknown as Record<string, unknown>))
    return resolved
  }
}

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : String(d)
}

function toContactModel(e: ContactEntity): ContactModel {
  const m = new ContactModel()
  m.id = e.id
  m.firstName = e.firstName
  m.lastName = e.lastName
  m.email = e.email
  m.phone = e.phone
  m.version = e.version
  m.companyId = e.companyId ?? null
  m.deleted = e.deleted
  m.createdAt = toIso(e.createdAt)
  m.updatedAt = toIso(e.updatedAt)
  return m
}

function toContactRevisionModel(e: ContactRevisionEntity): ContactRevisionModel {
  const m = new ContactRevisionModel()
  m.id = e.id
  m.contactId = e.contactId
  m.data = JSON.stringify(e.data ?? {})
  m.version = e.version
  m.clientId = e.clientId
  m.conflictStatus = e.conflictStatus
  m.createdAt = toIso(e.createdAt)
  return m
}
