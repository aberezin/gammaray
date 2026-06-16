import { MigrationInterface, QueryRunner } from 'typeorm'

// ADR 0012: a singleton app_meta row carries the server "data epoch". Clients
// compare it to detect a destructive server reset and reslate. The initial epoch
// is generated here; migrate/seed/manual bump it thereafter.
export class AddAppMeta1000000000009 implements MigrationInterface {
  name = 'AddAppMeta1000000000009'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "app_meta" (
        "id"         INTEGER PRIMARY KEY DEFAULT 1,
        "epoch"      UUID NOT NULL DEFAULT gen_random_uuid(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "app_meta_singleton" CHECK ("id" = 1)
      )
    `)
    await queryRunner.query(`INSERT INTO "app_meta" ("id") VALUES (1)`)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "app_meta"`)
  }
}
