import { MigrationInterface, QueryRunner } from 'typeorm'

// Generic revision log for the type-A engine (Phase 2). One table serves every
// revisioned table, keyed by (table_name, row_id), replacing per-table revision
// tables. The bespoke contact_revisions is dropped — its history does not carry
// over (acceptable for the POC; history re-accrues here going forward).
export class AddRowRevisions1000000000007 implements MigrationInterface {
  name = 'AddRowRevisions1000000000007'

  async up(queryRunner: QueryRunner): Promise<void> {
    // Reuse the existing conflict-status enum if present; create otherwise.
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "row_revisions_conflict_status_enum" AS ENUM ('none', 'detected', 'resolved');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `)
    await queryRunner.query(`
      CREATE TABLE "row_revisions" (
        "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
        "table_name"      TEXT NOT NULL,
        "row_id"          UUID NOT NULL,
        "data"            JSONB NOT NULL DEFAULT '{}',
        "version"         INTEGER NOT NULL,
        "client_id"       TEXT NOT NULL,
        "conflict_status" "row_revisions_conflict_status_enum" NOT NULL DEFAULT 'none',
        "created_at"      TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_row_revisions" PRIMARY KEY ("id")
      )
    `)
    await queryRunner.query(`
      CREATE INDEX "IDX_row_revisions_lookup" ON "row_revisions" ("table_name", "row_id", "version")
    `)

    // Backfill a baseline snapshot for existing contacts (their old
    // contact_revisions history doesn't carry over), so the history view and
    // 3-way merge have an ancestor. Shape matches projectToDescriptor(contact).
    await queryRunner.query(`
      INSERT INTO "row_revisions" ("table_name", "row_id", "data", "version", "client_id", "conflict_status")
      SELECT 'contact', c."id",
        jsonb_build_object(
          'id', c."id", 'firstName', c."first_name", 'lastName', c."last_name",
          'email', c."email", 'phone', c."phone", 'companyId', c."company_id",
          'version', c."version", 'updatedAt', c."updated_at", 'deleted', c."deleted"
        ),
        c."version", 'seed', 'none'
      FROM "contacts" c
      WHERE NOT EXISTS (
        SELECT 1 FROM "row_revisions" rr WHERE rr."table_name" = 'contact' AND rr."row_id" = c."id"
      )
    `)

    await queryRunner.query(`DROP TABLE IF EXISTS "contact_revisions"`)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate the bespoke contact_revisions (without its prior data).
    await queryRunner.query(`
      CREATE TABLE "contact_revisions" (
        "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
        "contact_id"      UUID NOT NULL,
        "data"            JSONB NOT NULL DEFAULT '{}',
        "version"         INTEGER NOT NULL,
        "client_id"       TEXT NOT NULL,
        "conflict_status" "contact_revisions_conflict_status_enum" NOT NULL DEFAULT 'none',
        "created_at"      TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_contact_revisions" PRIMARY KEY ("id")
      )
    `)
    await queryRunner.query(`DROP TABLE "row_revisions"`)
    await queryRunner.query(`DROP TYPE "row_revisions_conflict_status_enum"`)
  }
}
