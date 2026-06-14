import { MigrationInterface, QueryRunner } from 'typeorm'

// Type-A generalization, increment 1: a standalone contact table (no foreign
// keys) plus its field-aware revision log. Reuses the conflict_status_enum
// created by InitialSchema. Seeds a few demo contacts so the read view has data.
export class AddContacts1000000000001 implements MigrationInterface {
  name = 'AddContacts1000000000001'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "contacts" (
        "id"         UUID NOT NULL,
        "first_name" TEXT NOT NULL DEFAULT '',
        "last_name"  TEXT NOT NULL DEFAULT '',
        "email"      TEXT NOT NULL DEFAULT '',
        "phone"      TEXT NOT NULL DEFAULT '',
        "version"    INTEGER NOT NULL DEFAULT 0,
        "metadata"   JSONB NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_contacts" PRIMARY KEY ("id")
      )
    `)

    await queryRunner.query(`
      CREATE TABLE "contact_revisions" (
        "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
        "contact_id"      UUID NOT NULL,
        "data"            JSONB NOT NULL DEFAULT '{}',
        "version"         INTEGER NOT NULL,
        "client_id"       VARCHAR NOT NULL,
        "conflict_status" "conflict_status_enum" NOT NULL DEFAULT 'none',
        "created_at"      TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_contact_revisions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_contact_revisions_contact" FOREIGN KEY ("contact_id")
          REFERENCES "contacts"("id") ON DELETE CASCADE
      )
    `)

    await queryRunner.query(`
      CREATE INDEX "IDX_contact_revisions_contact_id" ON "contact_revisions"("contact_id")
    `)

    // Seed demo contacts and their initial (v1) revision snapshots in one shot.
    await queryRunner.query(`
      WITH ins AS (
        INSERT INTO "contacts" ("id", "first_name", "last_name", "email", "phone", "version")
        VALUES
          (gen_random_uuid(), 'Ada',   'Lovelace', 'ada@example.com',   '555-0001', 1),
          (gen_random_uuid(), 'Alan',  'Turing',   'alan@example.com',  '555-0002', 1),
          (gen_random_uuid(), 'Grace', 'Hopper',   'grace@example.com', '555-0003', 1)
        RETURNING "id", "first_name", "last_name", "email", "phone", "version"
      )
      INSERT INTO "contact_revisions" ("contact_id", "data", "version", "client_id", "conflict_status")
      SELECT
        "id",
        jsonb_build_object(
          'id', "id", 'firstName', "first_name", 'lastName', "last_name",
          'email', "email", 'phone', "phone", 'version', "version"
        ),
        "version", 'seed', 'none'
      FROM ins
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_contact_revisions_contact_id"`)
    await queryRunner.query(`DROP TABLE "contact_revisions"`)
    await queryRunner.query(`DROP TABLE "contacts"`)
  }
}
