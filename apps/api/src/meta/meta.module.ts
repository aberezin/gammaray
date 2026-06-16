import { Module } from '@nestjs/common'
import { MetaResolver } from './meta.resolver'

// Exposes the public `serverDataEpoch` query (ADR 0012).
@Module({
  providers: [MetaResolver],
})
export class MetaModule {}
