import { MigrationInterface, QueryRunner } from 'typeorm'

// Many-to-many: a tags table and a contact_tags join table. Both FKs on the
// join are DEFERRABLE INITIALLY DEFERRED, so one batch can create a contact, a
// tag, and the link row in any order (validated at commit). The partial unique
// index keeps at most one *active* link per (contact, tag) while still allowing
// a soft-deleted tombstone to coexist with a fresh re-link.
export class AddTags1000000000006 implements MigrationInterface {
  name = 'AddTags1000000000006'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tags" (
        "id"         UUID NOT NULL,
        "name"       TEXT NOT NULL DEFAULT '',
        "version"    INTEGER NOT NULL DEFAULT 0,
        "deleted"    BOOLEAN NOT NULL DEFAULT false,
        "metadata"   JSONB NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tags" PRIMARY KEY ("id")
      )
    `)

    await queryRunner.query(`
      CREATE TABLE "contact_tags" (
        "id"         UUID NOT NULL,
        "contact_id" UUID NOT NULL,
        "tag_id"     UUID NOT NULL,
        "version"    INTEGER NOT NULL DEFAULT 0,
        "deleted"    BOOLEAN NOT NULL DEFAULT false,
        "metadata"   JSONB NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_contact_tags" PRIMARY KEY ("id"),
        CONSTRAINT "FK_contact_tags_contact" FOREIGN KEY ("contact_id")
          REFERENCES "contacts"("id")
          ON DELETE CASCADE
          DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT "FK_contact_tags_tag" FOREIGN KEY ("tag_id")
          REFERENCES "tags"("id")
          ON DELETE CASCADE
          DEFERRABLE INITIALLY DEFERRED
      )
    `)

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_contact_tags_active"
        ON "contact_tags" ("contact_id", "tag_id")
        WHERE "deleted" = false
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "contact_tags"`)
    await queryRunner.query(`DROP TABLE "tags"`)
  }
}
