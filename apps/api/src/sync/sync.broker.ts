import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { PubSub } from 'graphql-subscriptions'
import { NoteModel } from '../notes/note.model'

const NOTE_UPDATED = 'noteUpdated'
const ROW_UPDATED = 'rowUpdated'

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

  // Generic type-A row channel: one stream for every table. Subscribers filter by
  // `table` (see the rows resolver). Type-A data is shared (no per-user topic).
  emitRow(table: string, row: Record<string, unknown>): void {
    void this.pubSub.publish(ROW_UPDATED, { table, row })
  }

  rowAsyncIterator() {
    return this.pubSub.asyncIterator(ROW_UPDATED)
  }

  onModuleDestroy() {
    // nothing to close for in-memory, but Redis client would be closed here
  }
}
