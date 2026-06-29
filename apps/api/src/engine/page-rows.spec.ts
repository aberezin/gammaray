import { NestFactory } from '@nestjs/core'
import type { INestApplicationContext } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { randomUUID } from 'crypto'
import { AppModule } from '../app.module'
import { RowRegistry } from './row-registry'
import { GenericRowService } from './generic-row.service'

// Framework regression for the at-scale list path (ADR 0013): the generic engine's
// keyset pagination — stable, non-overlapping pages, server-side sort/filter, and a
// terminal cursor. Exercised through a registered table (no per-table code) inside a
// rolled-back transaction, so it persists nothing.
//
// Requires the dev Postgres running (docker compose up -d postgres). Run with:
//   pnpm --filter @gammaray/api test
describe('GenericRowService.pageRows (keyset pagination)', () => {
  let app: INestApplicationContext
  let registry: RowRegistry
  let generic: GenericRowService
  let dataSource: DataSource

  beforeAll(async () => {
    app = await NestFactory.createApplicationContext(AppModule, { logger: false })
    registry = app.get(RowRegistry)
    generic = app.get(GenericRowService)
    dataSource = app.get(DataSource)
  })

  afterAll(async () => {
    await app?.close()
  })

  it('walks stable, non-overlapping pages with a terminal cursor; honors sort + filter', async () => {
    const reg = registry.get('genre')
    expect(reg).toBeDefined()

    // A unique prefix so `filter` isolates these rows from any seeded genres,
    // making `total` and the page contents deterministic inside the shared DB.
    const prefix = `zzpage-${randomUUID().slice(0, 8)}-`
    const names = ['a', 'c', 'b', 'e', 'd'] // inserted out of order on purpose
    const sortedAsc = [...names].sort().map((n) => prefix + n)

    const qr = dataSource.createQueryRunner()
    await qr.connect()
    await qr.startTransaction()
    try {
      const m = qr.manager
      for (const n of names) {
        const id = randomUUID()
        await reg!.apply(
          m,
          { table: 'genre', id, op: 'UPSERT', expectedVersion: 0, data: { id, name: prefix + n } },
          'test',
        )
      }

      const page = (after: string | null) =>
        generic.pageRows(reg!.descriptor, reg!.entity, { after, limit: 2, sort: 'name', dir: 'ASC', filter: prefix }, m)

      // Page 1 → first two by name ASC; total counts all 5 matches; more to come.
      const p1 = await page(null)
      expect(p1.total).toBe(5)
      expect(p1.rows.map((r) => r.name)).toEqual(sortedAsc.slice(0, 2))
      expect(p1.nextCursor).toBeTruthy()

      // Page 2 → next two, seeking past page 1's last row (no overlap).
      const p2 = await page(p1.nextCursor)
      expect(p2.rows.map((r) => r.name)).toEqual(sortedAsc.slice(2, 4))
      expect(p2.nextCursor).toBeTruthy()

      // Page 3 → the last row; cursor is now terminal.
      const p3 = await page(p2.nextCursor)
      expect(p3.rows.map((r) => r.name)).toEqual(sortedAsc.slice(4))
      expect(p3.nextCursor).toBeNull()

      // The three pages together cover every match exactly once.
      const all = [...p1.rows, ...p2.rows, ...p3.rows].map((r) => r.name)
      expect(all).toEqual(sortedAsc)

      // Descending sort reverses the first page.
      const desc = await generic.pageRows(
        reg!.descriptor, reg!.entity, { after: null, limit: 2, sort: 'name', dir: 'DESC', filter: prefix }, m,
      )
      expect(desc.rows.map((r) => r.name)).toEqual([...sortedAsc].reverse().slice(0, 2))
    } finally {
      await qr.rollbackTransaction()
      await qr.release()
    }
  })
})
