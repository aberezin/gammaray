/**
 * Manually bump the server data epoch (ADR 0012):
 *   pnpm --filter @gammaray/api db:epoch:bump
 *
 * Use after an out-of-app data change the automatic hooks don't cover — e.g. a
 * hand-run SQL edit or a restored backup — to force every client to reslate.
 */
import 'reflect-metadata'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../../../../.env') })

import { createDataSource, bumpDataEpoch } from '@gammaray/database'

async function main() {
  const ds = createDataSource()
  await ds.initialize()
  try {
    const epoch = await bumpDataEpoch(ds)
    console.log(`Data epoch bumped to ${epoch}.`)
  } finally {
    await ds.destroy()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
