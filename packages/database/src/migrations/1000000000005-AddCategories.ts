import { MigrationInterface, QueryRunner } from 'typeorm'

// Self-referential category tree. The parent_id FK is DEFERRABLE INITIALLY
// DEFERRED so a batch can insert a parent and its children in any order (the
// constraint is validated at commit). This is the table that exercises the
// self-reference handling in the batch coordinator.
export class AddCategories1000000000005 implements MigrationInterface {
  name = 'AddCategories1000000000005'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "categories" (
        "id"         UUID NOT NULL,
        "name"       TEXT NOT NULL DEFAULT '',
        "parent_id"  UUID,
        "version"    INTEGER NOT NULL DEFAULT 0,
        "deleted"    BOOLEAN NOT NULL DEFAULT false,
        "metadata"   JSONB NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_categories" PRIMARY KEY ("id"),
        CONSTRAINT "FK_categories_parent" FOREIGN KEY ("parent_id")
          REFERENCES "categories"("id")
          ON DELETE SET NULL
          DEFERRABLE INITIALLY DEFERRED
      )
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "categories"`)
  }
}
