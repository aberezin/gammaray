import { Resolver, Query, Mutation, Subscription, Args, Int } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { NotesService } from './notes.service'
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
    return this.notes.getOrCreateNote(user.id) as unknown as NoteModel
  }

  @Query(() => [RevisionModel])
  async revisions(@CurrentUser() user: UserEntity): Promise<RevisionModel[]> {
    return this.notes.getRevisions(user.id) as unknown as RevisionModel[]
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

  @Subscription(() => NoteModel, {
    filter: (payload: { noteUpdated: NoteModel }, _vars: unknown, context: { req: { user: UserEntity } }) =>
      payload.noteUpdated.id === context.req?.user?.id,
  })
  noteUpdated(@CurrentUser() _user: UserEntity) {
    return this.broker.asyncIterator()
  }
}
