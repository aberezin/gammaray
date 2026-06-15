import { Resolver, Query, Mutation, Subscription, Args, Int } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { ContactEntity, ContactRevisionEntity } from '@gammaray/database'
import { ContactsService } from './contacts.service'
import {
  ContactModel,
  ContactRevisionModel,
  ContactInput,
  ContactConflictResult,
} from './contact.model'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { SyncBroker } from '../sync/sync.broker'

@Resolver(() => ContactModel)
@UseGuards(JwtAuthGuard)
export class ContactsResolver {
  constructor(
    private readonly service: ContactsService,
    private readonly broker: SyncBroker,
  ) {}

  @Query(() => [ContactModel])
  async contacts(): Promise<ContactModel[]> {
    return (await this.service.listContacts()).map(toContactModel)
  }

  @Query(() => ContactModel, { nullable: true })
  async contact(@Args('id') id: string): Promise<ContactModel | null> {
    const c = await this.service.getContact(id)
    return c ? toContactModel(c) : null
  }

  @Query(() => [ContactRevisionModel])
  async contactRevisions(
    @Args('contactId') contactId: string,
  ): Promise<ContactRevisionModel[]> {
    return (await this.service.getContactRevisions(contactId)).map(toContactRevisionModel)
  }

  @Mutation(() => ContactConflictResult)
  async pushContact(
    @Args('input') input: ContactInput,
    @Args('expectedVersion', { type: () => Int }) expectedVersion: number,
    @Args('clientId') clientId: string,
  ): Promise<ContactConflictResult> {
    const r = await this.service.pushContact(input, expectedVersion, clientId)
    const out = new ContactConflictResult()
    out.conflict = r.conflict
    out.contact = r.contact ? toContactModel(r.contact) : null
    out.serverVersion = r.serverVersion ?? null
    out.serverData = r.serverData ? JSON.stringify(r.serverData) : null
    // Broadcast accepted changes (not conflicts) so open clients update live.
    if (out.contact) this.broker.emitContact(out.contact)
    return out
  }

  @Mutation(() => ContactModel)
  async resolveContactConflict(
    @Args('input') input: ContactInput,
    @Args('clientId') clientId: string,
  ): Promise<ContactModel> {
    const resolved = toContactModel(await this.service.resolveContactConflict(input, clientId))
    this.broker.emitContact(resolved)
    return resolved
  }

  @Subscription(() => ContactModel)
  contactUpdated() {
    // Contacts are a shared dataset — a single global channel, no per-user filter.
    return this.broker.contactAsyncIterator()
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
