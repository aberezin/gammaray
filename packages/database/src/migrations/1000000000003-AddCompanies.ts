import { MigrationInterface, QueryRunner } from 'typeorm'

// Type-A relations, increment 1: a companies lookup table and a soft many-to-one
// reference from contacts. No enforced FK constraint — the reference is advisory
// (offline-first; integrity handled at the app level). Seeds a few companies.
export class AddCompanies1000000000003 implements MigrationInterface {
  name = 'AddCompanies1000000000003'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "companies" (
        "id"         UUID NOT NULL,
        "name"       TEXT NOT NULL DEFAULT '',
        "version"    INTEGER NOT NULL DEFAULT 0,
        "deleted"    BOOLEAN NOT NULL DEFAULT false,
        "metadata"   JSONB NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_companies" PRIMARY KEY ("id")
      )
    `)

    // Soft reference — a plain column, deliberately without a FK constraint.
    await queryRunner.query(`ALTER TABLE "contacts" ADD COLUMN "company_id" UUID`)

    await queryRunner.query(`
      INSERT INTO "companies" ("id", "name", "version") VALUES
        (gen_random_uuid(), 'Acme Inc', 1),
        (gen_random_uuid(), 'Globex', 1),
        (gen_random_uuid(), 'Initech', 1)
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN "company_id"`)
    await queryRunner.query(`DROP TABLE "companies"`)
  }
}
