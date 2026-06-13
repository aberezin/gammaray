import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { PubSub } from 'graphql-subscriptions'
import { NoteModel } from '../notes/note.model'

const NOTE_UPDATED = 'noteUpdated'

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

  onModuleDestroy() {
    // nothing to close for in-memory, but Redis client would be closed here
  }
}
