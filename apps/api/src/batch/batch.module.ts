import { Module } from '@nestjs/common'
import { EngineModule } from '../engine/engine.module'
import { SyncModule } from '../sync/sync.module'
import { BatchService } from './batch.service'
import { BatchResolver } from './batch.resolver'

@Module({
  imports: [EngineModule, SyncModule],
  providers: [BatchService, BatchResolver],
})
export class BatchModule {}
