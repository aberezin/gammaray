import { MigrationInterface, QueryRunner } from 'typeorm'

// Enforced referential integrity for the contact→company reference, as a
// DEFERRABLE INITIALLY DEFERRED foreign key. Deferral means the constraint is
// validated at COMMIT, so an atomic batch can insert parent and child in any
// order (and handle cycles/self-refs) without per-statement ordering. Existing
// dangling references are nulled first so the constraint can be added.
export class DeferrableCompanyFk1000000000004 implements MigrationInterface {
  name = 'DeferrableCompanyFk1000000000004'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "contacts" SET "company_id" = NULL
      WHERE "company_id" IS NOT NULL
        AND "company_id" NOT IN (SELECT "id" FROM "companies")
    `)
    await queryRunner.query(`
      ALTER TABLE "contacts"
        ADD CONSTRAINT "FK_contacts_company"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE SET NULL
        DEFERRABLE INITIALLY DEFERRED
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "contacts" DROP CONSTRAINT "FK_contacts_company"`)
  }
}
