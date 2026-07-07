import { MigrationInterface, QueryRunner } from 'typeorm'

// Add temporal validity to all join tables: effective_from (when the link
// became active) and effective_to (when it was deactivated, null while active).
// Removing a link now stamps effective_to instead of only soft-deleting, so the
// full "when was this link active" history is queryable without touching the
// parent row's version or revision log. Existing deleted rows are backfilled
// with updated_at as a best-effort deactivation time.
export class AddJoinTemporalValidity1000000000012 implements MigrationInterface {
  name = 'AddJoinTemporalValidity1000000000012'

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['contact_tags', 'album_genres', 'track_artists', 'playlist_tracks']) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
          ADD COLUMN effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          ADD COLUMN effective_to   TIMESTAMPTZ
      `)
      await queryRunner.query(`
        UPDATE "${table}" SET effective_to = updated_at WHERE deleted = true
      `)
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['contact_tags', 'album_genres', 'track_artists', 'playlist_tracks']) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
          DROP COLUMN IF EXISTS effective_from,
          DROP COLUMN IF EXISTS effective_to
      `)
    }
  }
}
