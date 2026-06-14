import { Resolver, Query, Mutation, Subscription, Args, Int } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { NotesService, toNoteModel, toRevisionModel } from './notes.service'
import { NoteModel, RevisionModel, ConflictResultModel } from './note.model'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { SyncBroker } from '../sync/sync.broker'
import { UserEntity } from '@gammaray/database'

@Resolver(() => NoteModel)
@UseGuards(JwtAuthGuard)
export class NotesResolver {
  constructor(
    private readonly notes: NotesService,
    private readonly broker: SyncBroker,
  ) {}

  @Query(() => NoteModel)
  async note(@CurrentUser() user: UserEntity): Promise<NoteModel> {
    return toNoteModel(await this.notes.getOrCreateNote(user.id))
  }

  @Query(() => [RevisionModel])
  async revisions(@CurrentUser() user: UserEntity): Promise<RevisionModel[]> {
    const revisions = await this.notes.getRevisions(user.id)
    return revisions.map(toRevisionModel)
  }

  @Mutation(() => ConflictResultModel)
  async pushNote(
    @CurrentUser() user: UserEntity,
    @Args('content') content: string,
    @Args('expectedVersion', { type: () => Int }) expectedVersion: number,
    @Args('clientId') clientId: string,
  ): Promise<ConflictResultModel> {
    return this.notes.pushNote(user.id, content, expectedVersion, clientId)
  }

  @Mutation(() => NoteModel)
  async resolveConflict(
    @CurrentUser() user: UserEntity,
    @Args('noteId') noteId: string,
    @Args('resolvedContent') resolvedContent: string,
    @Args('clientId') clientId: string,
  ): Promise<NoteModel> {
    return this.notes.resolveConflict(user.id, noteId, resolvedContent, clientId)
  }

  @Subscription(() => NoteModel)
  noteUpdated(@CurrentUser() user: UserEntity) {
    // Per-user topic: every payload on this channel already belongs to the
    // authenticated user, so no payload filter is needed.
    return this.broker.asyncIterator(user.id)
  }
}
