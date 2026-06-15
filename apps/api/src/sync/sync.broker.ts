import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { PubSub } from 'graphql-subscriptions'
import { NoteModel } from '../notes/note.model'
import { ContactModel } from '../contacts/contact.model'
import { CompanyModel } from '../companies/company.model'

const NOTE_UPDATED = 'noteUpdated'
const CONTACT_UPDATED = 'contactUpdated'
const COMPANY_UPDATED = 'companyUpdated'

/**
 * Thin abstraction over a pub/sub backend.
 * Today: in-process PubSub (single instance only).
 * Swap: replace PubSub with RedisPubSub from graphql-redis-subscriptions
 * and update the constructor — no callers need to change.
 */
@Injectable()
export class SyncBroker implements OnModuleDestroy {
  private readonly pubSub = new PubSub()

  emit(userId: string, note: NoteModel): void {
    void this.pubSub.publish(`${NOTE_UPDATED}:${userId}`, { noteUpdated: note })
  }

  asyncIterator(userId?: string) {
    const topic = userId ? `${NOTE_UPDATED}:${userId}` : NOTE_UPDATED
    return this.pubSub.asyncIterator(topic)
  }

  // Contacts are a shared dataset, so their channel is global (no per-user topic).
  emitContact(contact: ContactModel): void {
    void this.pubSub.publish(CONTACT_UPDATED, { contactUpdated: contact })
  }

  contactAsyncIterator() {
    return this.pubSub.asyncIterator(CONTACT_UPDATED)
  }

  emitCompany(company: CompanyModel): void {
    void this.pubSub.publish(COMPANY_UPDATED, { companyUpdated: company })
  }

  companyAsyncIterator() {
    return this.pubSub.asyncIterator(COMPANY_UPDATED)
  }

  onModuleDestroy() {
    // nothing to close for in-memory, but Redis client would be closed here
  }
}
