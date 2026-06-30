import { Module } from '@nestjs/common'
import { GraphQLModule } from '@nestjs/graphql'
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo'
import { DatabaseModule } from './database/database.module'
import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { EngineModule } from './engine/engine.module'
import { BatchModule } from './batch/batch.module'
import { SyncModule } from './sync/sync.module'
import { MetaModule } from './meta/meta.module'

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      subscriptions: {
        'graphql-ws': {
          // Capture the client's connectionParams so the context factory can
          // read the JWT for WebSocket subscriptions.
          onConnect: (ctx: {
            connectionParams?: Record<string, unknown>
            extra: unknown
          }) => {
            ;(ctx.extra as Record<string, unknown>).connectionParams =
              ctx.connectionParams ?? {}
          },
        },
      },
      // Unify HTTP and WebSocket auth: both produce a `req` with an
      // Authorization header so the passport-jwt guard works the same way.
      // HTTP context arrives as { req, res }; graphql-ws context carries `extra`
      // (populated in onConnect above).
      context: (ctx: {
        req?: unknown
        res?: unknown
        extra?: { connectionParams?: Record<string, unknown> }
      }) => {
        if (ctx.extra) {
          const params = ctx.extra.connectionParams ?? {}
          const authorization = (params.Authorization ?? params.authorization) as string | undefined
          return { req: { headers: { authorization } } }
        }
        return { req: ctx.req, res: ctx.res }
      },
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    EngineModule,
    BatchModule,
    SyncModule,
    MetaModule,
  ],
})
export class AppModule {}
