import { MigrationInterface, QueryRunner } from 'typeorm'

export class InitialSchema1000000000000 implements MigrationInterface {
  name = 'InitialSchema1000000000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
        "email"         VARCHAR NOT NULL,
        "password_hash" VARCHAR NOT NULL,
        "created_at"    TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `)

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

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_note_revisions_note_id"`)
    await queryRunner.query(`DROP TABLE "note_revisions"`)
    await queryRunner.query(`DROP TYPE "conflict_status_enum"`)
    await queryRunner.query(`DROP TABLE "notes"`)
    await queryRunner.query(`DROP TABLE "users"`)
  }
}
