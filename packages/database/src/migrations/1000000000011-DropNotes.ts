import { MigrationInterface, QueryRunner } from 'typeorm'

// Retire the original NoteSync "single note" feature: it was hand-built before the
// generic type-A engine existed and never migrated onto it (its own service,
// resolver, conflict logic, revision table, and frontend sync). The generic engine
// + the contact/CRM and music example schemas now demonstrate the framework; the
// bespoke note is dropped. `notes` / `note_revisions` (and the note-only
// `conflict_status_enum`) were created in InitialSchema; this drops them. The
// generic `row_revisions` table has its own `row_revisions_conflict_status_enum`
// and is untouched. `down` recreates them exactly as InitialSchema did.
export class DropNotes1000000000011 implements MigrationInterface {
  name = 'DropNotes1000000000011'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_note_revisions_note_id"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "note_revisions"`)
    await queryRunner.query(`DROP TYPE IF EXISTS "conflict_status_enum"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "notes"`)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notes" (
        "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
        "user_id"    UUID NOT NULL,
        "content"    TEXT NOT NULL DEFAULT '',
        "version"    INTEGER NOT NULL DEFAULT 0,
        "metadata"   JSONB NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notes_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `)
    await queryRunner.query(`
      CREATE TYPE "conflict_status_enum" AS ENUM ('none', 'detected', 'resolved')
    `)
    await queryRunner.query(`
      CREATE TABLE "note_revisions" (
        "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
        "note_id"          UUID NOT NULL,
        "content"          TEXT NOT NULL,
        "version"          INTEGER NOT NULL,
        "client_id"        VARCHAR NOT NULL,
        "conflict_status"  "conflict_status_enum" NOT NULL DEFAULT 'none',
        "resolved_content" TEXT,
        "metadata"         JSONB NOT NULL DEFAULT '{}',
        "created_at"       TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_note_revisions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_note_revisions_note" FOREIGN KEY ("note_id")
          REFERENCES "notes"("id") ON DELETE CASCADE
      )
    `)
    await queryRunner.query(`
      CREATE INDEX "IDX_note_revisions_note_id" ON "note_revisions"("note_id")
    `)
  }
}
