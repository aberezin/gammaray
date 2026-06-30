import 'reflect-metadata'
import { DataSource, DataSourceOptions } from 'typeorm'
import { ALL_ENTITIES } from './entities'

export function createDataSource(overrides: Partial<DataSourceOptions> = {}): DataSource {
  return new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: Number(process.env.DATABASE_PORT ?? 5432),
    username: process.env.DATABASE_USER ?? 'gammaray',
    password: process.env.DATABASE_PASSWORD ?? 'gammaray',
    database: process.env.DATABASE_NAME ?? 'gammaray',
    entities: ALL_ENTITIES,
    migrations: [__dirname + '/migrations/*.{ts,js}'],
    // Never enable synchronize — use migrations only
    synchronize: false,
    logging: process.env.NODE_ENV === 'development',
    ...overrides,
  } as DataSourceOptions)
}

/** Singleton used by the migration CLI */
export const AppDataSource = createDataSource()
