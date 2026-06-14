import { MigrationInterface, QueryRunner } from 'typeorm'

// Soft-delete support for contacts: a tombstone flag. Deleted rows are retained
// so replication can propagate the deletion (the pull returns them as _deleted),
// and so history is preserved.
export class AddContactDeleted1000000000002 implements MigrationInterface {
  name = 'AddContactDeleted1000000000002'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "contacts" ADD COLUMN "deleted" BOOLEAN NOT NULL DEFAULT false`,
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN "deleted"`)
  }
}
