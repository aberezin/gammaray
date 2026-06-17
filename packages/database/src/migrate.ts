/** Standalone migration runner — called by `pnpm db:migrate` */
import 'reflect-metadata'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../../../.env') })

import { AppDataSource } from './data-source'
import { bumpDataEpoch } from './data-epoch'

async function main() {
  await AppDataSource.initialize()
  const pending = await AppDataSource.showMigrations()
  if (!pending) {
    console.log('No pending migrations.')
    await AppDataSource.destroy()
    return
  }
  await AppDataSource.runMigrations()
  // Schema/data changed out-of-app → bump the epoch so clients reslate (ADR 0012).
  const epoch = await bumpDataEpoch(AppDataSource)
  console.log(`Migrations complete. Data epoch bumped to ${epoch}.`)
  await AppDataSource.destroy()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
