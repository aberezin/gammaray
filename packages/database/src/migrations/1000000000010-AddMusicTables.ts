import { MigrationInterface, QueryRunner } from 'typeorm'

// The "Crate" music-library example app's tables (a second app sharing this
// backend — see docs/example-app-spec §7). Every type-A reference is a
// DEFERRABLE INITIALLY DEFERRED foreign key (validated at COMMIT), so one atomic
// batch can create parent+child rows in any order, including the genre
// self-reference. m2o refs ON DELETE SET NULL (nullable); join FKs ON DELETE
// CASCADE. Each join keeps a partial unique index over its active (non-deleted)
// pairs, so a soft-deleted tombstone can coexist with a fresh re-link.
export class AddMusicTables1000000000010 implements MigrationInterface {
  name = 'AddMusicTables1000000000010'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "labels" (
        "id"         UUID NOT NULL,
        "name"       TEXT NOT NULL DEFAULT '',
        "version"    INTEGER NOT NULL DEFAULT 0,
        "deleted"    BOOLEAN NOT NULL DEFAULT false,
        "metadata"   JSONB NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_labels" PRIMARY KEY ("id")
      )
    `)

    await queryRunner.query(`
      CREATE TABLE "artists" (
        "id"         UUID NOT NULL,
        "name"       TEXT NOT NULL DEFAULT '',
        "bio"        TEXT NOT NULL DEFAULT '',
        "version"    INTEGER NOT NULL DEFAULT 0,
        "deleted"    BOOLEAN NOT NULL DEFAULT false,
        "metadata"   JSONB NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_artists" PRIMARY KEY ("id")
      )
    `)

    // Self-referential tree: parent_id → genres (inline self-FK, deferrable).
    await queryRunner.query(`
      CREATE TABLE "genres" (
        "id"         UUID NOT NULL,
        "name"       TEXT NOT NULL DEFAULT '',
        "parent_id"  UUID,
        "version"    INTEGER NOT NULL DEFAULT 0,
        "deleted"    BOOLEAN NOT NULL DEFAULT false,
        "metadata"   JSONB NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_genres" PRIMARY KEY ("id"),
        CONSTRAINT "FK_genres_parent" FOREIGN KEY ("parent_id")
          REFERENCES "genres"("id") ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED
      )
    `)

    await queryRunner.query(`
      CREATE TABLE "albums" (
        "id"         UUID NOT NULL,
        "title"      TEXT NOT NULL DEFAULT '',
        "year"       INTEGER NOT NULL DEFAULT 0,
        "label_id"   UUID,
        "version"    INTEGER NOT NULL DEFAULT 0,
        "deleted"    BOOLEAN NOT NULL DEFAULT false,
        "metadata"   JSONB NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_albums" PRIMARY KEY ("id"),
        CONSTRAINT "FK_albums_label" FOREIGN KEY ("label_id")
          REFERENCES "labels"("id") ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED
      )
    `)

    await queryRunner.query(`
      CREATE TABLE "tracks" (
        "id"           UUID NOT NULL,
        "title"        TEXT NOT NULL DEFAULT '',
        "track_no"     INTEGER NOT NULL DEFAULT 0,
        "duration_sec" INTEGER NOT NULL DEFAULT 0,
        "explicit"     BOOLEAN NOT NULL DEFAULT false,
        "album_id"     UUID,
        "version"      INTEGER NOT NULL DEFAULT 0,
        "deleted"      BOOLEAN NOT NULL DEFAULT false,
        "metadata"     JSONB NOT NULL DEFAULT '{}',
        "created_at"   TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tracks" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tracks_album" FOREIGN KEY ("album_id")
          REFERENCES "albums"("id") ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED
      )
    `)

    await queryRunner.query(`
      CREATE TABLE "playlists" (
        "id"          UUID NOT NULL,
        "name"        TEXT NOT NULL DEFAULT '',
        "description" TEXT NOT NULL DEFAULT '',
        "version"     INTEGER NOT NULL DEFAULT 0,
        "deleted"     BOOLEAN NOT NULL DEFAULT false,
        "metadata"    JSONB NOT NULL DEFAULT '{}',
        "created_at"  TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_playlists" PRIMARY KEY ("id")
      )
    `)

    await queryRunner.query(`
      CREATE TABLE "album_genres" (
        "id"         UUID NOT NULL,
        "album_id"   UUID NOT NULL,
        "genre_id"   UUID NOT NULL,
        "version"    INTEGER NOT NULL DEFAULT 0,
        "deleted"    BOOLEAN NOT NULL DEFAULT false,
        "metadata"   JSONB NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_album_genres" PRIMARY KEY ("id"),
        CONSTRAINT "FK_album_genres_album" FOREIGN KEY ("album_id")
          REFERENCES "albums"("id") ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT "FK_album_genres_genre" FOREIGN KEY ("genre_id")
          REFERENCES "genres"("id") ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_album_genres_active"
        ON "album_genres" ("album_id", "genre_id") WHERE "deleted" = false
    `)

    await queryRunner.query(`
      CREATE TABLE "track_artists" (
        "id"         UUID NOT NULL,
        "track_id"   UUID NOT NULL,
        "artist_id"  UUID NOT NULL,
        "version"    INTEGER NOT NULL DEFAULT 0,
        "deleted"    BOOLEAN NOT NULL DEFAULT false,
        "metadata"   JSONB NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_track_artists" PRIMARY KEY ("id"),
        CONSTRAINT "FK_track_artists_track" FOREIGN KEY ("track_id")
          REFERENCES "tracks"("id") ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT "FK_track_artists_artist" FOREIGN KEY ("artist_id")
          REFERENCES "artists"("id") ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_track_artists_active"
        ON "track_artists" ("track_id", "artist_id") WHERE "deleted" = false
    `)

    await queryRunner.query(`
      CREATE TABLE "playlist_tracks" (
        "id"          UUID NOT NULL,
        "playlist_id" UUID NOT NULL,
        "track_id"    UUID NOT NULL,
        "version"     INTEGER NOT NULL DEFAULT 0,
        "deleted"     BOOLEAN NOT NULL DEFAULT false,
        "metadata"    JSONB NOT NULL DEFAULT '{}',
        "created_at"  TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_playlist_tracks" PRIMARY KEY ("id"),
        CONSTRAINT "FK_playlist_tracks_playlist" FOREIGN KEY ("playlist_id")
          REFERENCES "playlists"("id") ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        CONSTRAINT "FK_playlist_tracks_track" FOREIGN KEY ("track_id")
          REFERENCES "tracks"("id") ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_playlist_tracks_active"
        ON "playlist_tracks" ("playlist_id", "track_id") WHERE "deleted" = false
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "playlist_tracks"`)
    await queryRunner.query(`DROP TABLE "track_artists"`)
    await queryRunner.query(`DROP TABLE "album_genres"`)
    await queryRunner.query(`DROP TABLE "playlists"`)
    await queryRunner.query(`DROP TABLE "tracks"`)
    await queryRunner.query(`DROP TABLE "albums"`)
    await queryRunner.query(`DROP TABLE "genres"`)
    await queryRunner.query(`DROP TABLE "artists"`)
    await queryRunner.query(`DROP TABLE "labels"`)
  }
}
