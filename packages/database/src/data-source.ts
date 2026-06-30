import 'reflect-metadata'
import { DataSource, DataSourceOptions } from 'typeorm'
import { UserEntity } from './entities/user.entity'
import { ContactEntity } from './entities/contact.entity'
import { RowRevisionEntity } from './entities/row-revision.entity'
import { CompanyEntity } from './entities/company.entity'
import { CategoryEntity } from './entities/category.entity'
import { TagEntity } from './entities/tag.entity'
import { ContactTagEntity } from './entities/contact-tag.entity'
import { AppMetaEntity } from './entities/app-meta.entity'
import { LabelEntity } from './entities/label.entity'
import { ArtistEntity } from './entities/artist.entity'
import { GenreEntity } from './entities/genre.entity'
import { AlbumEntity } from './entities/album.entity'
import { TrackEntity } from './entities/track.entity'
import { PlaylistEntity } from './entities/playlist.entity'
import { AlbumGenreEntity } from './entities/album-genre.entity'
import { TrackArtistEntity } from './entities/track-artist.entity'
import { PlaylistTrackEntity } from './entities/playlist-track.entity'

export function createDataSource(overrides: Partial<DataSourceOptions> = {}): DataSource {
  return new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: Number(process.env.DATABASE_PORT ?? 5432),
    username: process.env.DATABASE_USER ?? 'gammaray',
    password: process.env.DATABASE_PASSWORD ?? 'gammaray',
    database: process.env.DATABASE_NAME ?? 'gammaray',
    entities: [
      UserEntity,
      ContactEntity,
      CompanyEntity,
      CategoryEntity,
      TagEntity,
      ContactTagEntity,
      RowRevisionEntity,
      AppMetaEntity,
      LabelEntity,
      ArtistEntity,
      GenreEntity,
      AlbumEntity,
      TrackEntity,
      PlaylistEntity,
      AlbumGenreEntity,
      TrackArtistEntity,
      PlaylistTrackEntity,
    ],
    migrations: [__dirname + '/migrations/*.{ts,js}'],
    // Never enable synchronize — use migrations only
    synchronize: false,
    logging: process.env.NODE_ENV === 'development',
    ...overrides,
  } as DataSourceOptions)
}

/** Singleton used by the migration CLI */
export const AppDataSource = createDataSource()
