import { Module } from '@nestjs/common'
import { SyncModule } from '../sync/sync.module'
import { GenericRowService } from './generic-row.service'
import { RowRegistry } from './row-registry'
import { RowsResolver } from './rows.resolver'

// The generic type-A engine: descriptor-driven reads (rows), live updates
// (rowUpdated), the applier (flat + revisioned/merge), revision history, and
// conflict resolution. Writes ride the batch endpoint, which resolves tables
// through this registry. Entities are reached via the global DataSource.
@Module({
  imports: [SyncModule],
  providers: [GenericRowService, RowRegistry, RowsResolver],
  exports: [GenericRowService, RowRegistry],
})
export class EngineModule {}
