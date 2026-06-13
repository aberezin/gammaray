import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { NoteEntity, NoteRevisionEntity } from '@gammaray/database'
import { NotesService } from './notes.service'
import { NotesResolver } from './notes.resolver'
import { SyncModule } from '../sync/sync.module'

@Module({
  imports: [TypeOrmModule.forFeature([NoteEntity, NoteRevisionEntity]), SyncModule],
  providers: [NotesService, NotesResolver],
})
export class NotesModule {}
