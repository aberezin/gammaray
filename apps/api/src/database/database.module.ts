import { Module, Global } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ALL_ENTITIES } from '@gammaray/database'

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres' as const,
        host: process.env.DATABASE_HOST ?? 'localhost',
        port: Number(process.env.DATABASE_PORT ?? 5432),
        username: process.env.DATABASE_USER ?? 'gammaray',
        password: process.env.DATABASE_PASSWORD ?? 'gammaray',
        database: process.env.DATABASE_NAME ?? 'gammaray',
        // One canonical entity list, shared with the migration data source — no
        // more keeping two registrations in sync (the old EntityMetadataNotFound footgun).
        entities: ALL_ENTITIES,
        migrations: [],
        synchronize: false,
        logging: process.env.NODE_ENV === 'development',
      }),
    }),
  ],
})
export class DatabaseModule {}
