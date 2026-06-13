/** Standalone migration runner — called by `pnpm db:migrate` */
import 'reflect-metadata'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../../../.env') })

import { AppDataSource } from './data-source'

async function main() {
  await AppDataSource.initialize()
  const pending = await AppDataSource.showMigrations()
  if (!pending) {
    console.log('No pending migrations.')
    await AppDataSource.destroy()
    return
  }
  await AppDataSource.runMigrations()
  console.log('Migrations complete.')
  await AppDataSource.destroy()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
