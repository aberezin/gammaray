import { Module } from '@nestjs/common'
import { GraphQLModule } from '@nestjs/graphql'
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo'
import { DatabaseModule } from './database/database.module'
import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { NotesModule } from './notes/notes.module'
import { SyncModule } from './sync/sync.module'

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      subscriptions: {
        'graphql-ws': true,
      },
      context: ({ req, res }: { req: unknown; res: unknown }) => ({ req, res }),
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    NotesModule,
    SyncModule,
  ],
})
export class AppModule {}
