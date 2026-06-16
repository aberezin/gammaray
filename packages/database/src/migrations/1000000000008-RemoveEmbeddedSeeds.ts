import { MigrationInterface, QueryRunner } from 'typeorm'

// ADR 0011: seed data moves out of migrations into `db:seed` (engine-driven,
// idempotent). This removes the rows the earlier migrations inserted so the
// seeder becomes the single source of seed data. Matches them by their seed
// identity (the historical seeds used gen_random_uuid(), so there is no stable
// id to target). On a fresh DB the earlier migrations seed, then this clears
// them; `db:seed` repopulates with stable ids. User-created rows are untouched.
export class RemoveEmbeddedSeeds1000000000008 implements MigrationInterface {
  name = 'RemoveEmbeddedSeeds1000000000008'

  async up(queryRunner: QueryRunner): Promise<void> {
    // Baseline contact revisions were all stamped client_id 'seed'.
    await queryRunner.query(`DELETE FROM "row_revisions" WHERE "client_id" = 'seed'`)
    await queryRunner.query(`
      DELETE FROM "contacts"
      WHERE "email" IN ('ada@example.com', 'alan@example.com', 'grace@example.com')
    `)
    await queryRunner.query(`
      DELETE FROM "companies"
      WHERE "name" IN ('Acme Inc', 'Globex', 'Initech')
    `)
  }

  // Irreversible by design: the baseline is now owned by `db:seed`, not by
  // migration history. Re-run `pnpm --filter @gammaray/api db:seed` to restore it.
  async down(): Promise<void> {
    /* no-op */
  }
}
