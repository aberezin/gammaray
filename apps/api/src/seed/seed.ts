/**
 * Database seeder (ADR 0011).
 *
 *   pnpm --filter @gammaray/api db:seed            # idempotent: create missing core rows
 *   pnpm --filter @gammaray/api db:seed --reset    # truncate type-A tables first, then seed
 *
 * Seeds write through the SAME generic engine the app uses (GenericRowService via
 * RowRegistry), so the seed always matches the schema/descriptors at the checked-
 * out revision — no hand-written SQL to drift. Idempotent by stable id: an
 * existing row is skipped (no version bump, no duplicate revision), so this is
 * safe to run on every container boot and from the Playwright globalSetup.
 */
import 'reflect-metadata'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../../../../.env') })

import { NestFactory } from '@nestjs/core'
import { DataSource } from 'typeorm'
import { bumpDataEpoch } from '@gammaray/database'
import { AppModule } from '../app.module'
import { RowRegistry } from '../engine/row-registry'
import { type SeedRow } from './seed-data'
import { enabledSeed } from './schema-seeds'

const SEED_CLIENT_ID = 'seed'

async function main() {
  const reset = process.argv.includes('--reset')
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] })
  try {
    const registry = app.get(RowRegistry)
    const dataSource = app.get(DataSource)

    if (reset) await truncateTypeATables(dataSource, registry)

    // Group the fixture by table, then apply tables in dependency order
    // (companies before contacts, etc.) so soft references resolve.
    const byTable = new Map<string, SeedRow[]>()
    for (const row of enabledSeed()) {
      const list = byTable.get(row.table) ?? []
      list.push(row)
      byTable.set(row.table, list)
    }

    let created = 0
    let skipped = 0
    await dataSource.transaction(async (manager) => {
      for (const table of registry.order) {
        const rows = byTable.get(table)
        if (!rows) continue
        const reg = registry.get(table)
        if (!reg) throw new Error(`seed references unknown table: ${table}`)

        for (const row of rows) {
          const id = String(row.data.id)
          const exists = (await reg.existing(manager, [id])).has(id)
          if (exists) {
            skipped++
            continue
          }
          await reg.apply(
            manager,
            { table, id, op: 'UPSERT', data: row.data, expectedVersion: 0 },
            SEED_CLIENT_ID,
          )
          created++
        }
      }
    })

    console.log(`Seed complete: ${created} created, ${skipped} already present${reset ? ' (after --reset)' : ''}.`)

    // Data changed out-of-app → bump the epoch so clients reslate (ADR 0012).
    // A no-op seed (nothing created, no reset) leaves the epoch alone, so a plain
    // container restart doesn't force every client to refresh.
    if (created > 0 || reset) {
      const epoch = await bumpDataEpoch(dataSource)
      console.log(`Data epoch bumped to ${epoch}.`)
    }
  } finally {
    await app.close()
  }
}

// --reset: clear all type-A data (registry tables + the shared revision log) so
// the next seed yields a clean, known baseline. Notes/users are untouched.
async function truncateTypeATables(dataSource: DataSource, registry: RowRegistry) {
  const tables = new Set<string>(['row_revisions'])
  for (const reg of registry.all()) {
    tables.add(dataSource.getRepository(reg.entity).metadata.tableName)
  }
  const list = [...tables].map((t) => `"${t}"`).join(', ')
  await dataSource.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
  console.log(`Reset: truncated ${list}.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
