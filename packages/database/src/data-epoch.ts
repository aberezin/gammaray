import { DataSource } from 'typeorm'

// Bump the server data epoch (ADR 0012) to a fresh value, signalling clients to
// reslate. Call this AFTER any out-of-app change that actually mutated data
// (migrations applied, seed created/reset rows, a manual data edit) — NOT on a
// no-op idempotent boot, or every restart would force every client to reslate.
// Returns the new epoch.
export async function bumpDataEpoch(dataSource: DataSource): Promise<string> {
  await dataSource.query(
    `UPDATE "app_meta" SET "epoch" = gen_random_uuid(), "updated_at" = now() WHERE "id" = 1`,
  )
  const rows = (await dataSource.query(
    `SELECT "epoch" FROM "app_meta" WHERE "id" = 1`,
  )) as Array<{ epoch: string }>
  return rows[0]?.epoch
}
