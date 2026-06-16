import { Resolver, Query } from '@nestjs/graphql'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { AppMetaEntity } from '@gammaray/database'

// Public read of the server data epoch (ADR 0012). The client fetches this at
// startup and reslates its local replica if the epoch changed since it last
// synced. No auth guard: the epoch is not sensitive and the check should work
// regardless of token state.
@Resolver()
export class MetaResolver {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Query(() => String, { name: 'serverDataEpoch' })
  async serverDataEpoch(): Promise<string> {
    const row = await this.dataSource.getRepository(AppMetaEntity).findOneByOrFail({ id: 1 })
    return row.epoch
  }
}
