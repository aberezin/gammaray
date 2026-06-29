import { NestFactory } from '@nestjs/core'
import type { INestApplicationContext } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { randomUUID } from 'crypto'
import { AppModule } from '../app.module'
import { RowRegistry } from './row-registry'

// Framework regression: the generic engine's optimistic-concurrency / version
// semantics, which every type-A table relies on. Exercised through a registered
// table (no per-table code) and rolled back, so it persists nothing.
//
// Requires the dev Postgres running (docker compose up -d postgres). Run with:
//   pnpm --filter @gammaray/api test
describe('GenericRowService version semantics', () => {
  let app: INestApplicationContext
  let registry: RowRegistry
  let dataSource: DataSource

  beforeAll(async () => {
    app = await NestFactory.createApplicationContext(AppModule, { logger: false })
    registry = app.get(RowRegistry)
    dataSource = app.get(DataSource)
  })

  afterAll(async () => {
    await app?.close()
  })

  it('create → v1; edit with matching expectedVersion → v2; stale edit → CONFLICT (unchanged)', async () => {
    const reg = registry.get('genre')
    expect(reg).toBeDefined()

    const qr = dataSource.createQueryRunner()
    await qr.connect()
    await qr.startTransaction()
    try {
      const m = qr.manager
      const id = randomUUID()
      const read = () =>
        m.getRepository(reg!.entity).findOne({ where: { id } }) as Promise<{ version: number; name: string } | null>

      // Create → version 1.
      await reg!.apply(m, { table: 'genre', id, op: 'UPSERT', expectedVersion: 0, data: { id, name: 'Alpha' } }, 'test')
      expect((await read())?.version).toBe(1)

      // Edit a column with the matching expectedVersion → APPLIED, version 2.
      const edit = await reg!.apply(m, { table: 'genre', id, op: 'UPSERT', expectedVersion: 1, data: { id, name: 'Beta' } }, 'test')
      expect(edit.status).toBe('APPLIED')
      const edited = await read()
      expect(edited?.version).toBe(2)
      expect(edited?.name).toBe('Beta')

      // Stale expectedVersion → CONFLICT, the row is left unchanged.
      const stale = await reg!.apply(m, { table: 'genre', id, op: 'UPSERT', expectedVersion: 0, data: { id, name: 'Gamma' } }, 'test')
      expect(stale.status).toBe('CONFLICT')
      const afterStale = await read()
      expect(afterStale?.version).toBe(2)
      expect(afterStale?.name).toBe('Beta')
    } finally {
      await qr.rollbackTransaction()
      await qr.release()
    }
  })
})
