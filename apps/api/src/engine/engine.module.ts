import { Module } from '@nestjs/common'
import { ContactsModule } from '../contacts/contacts.module'
import { SyncModule } from '../sync/sync.module'
import { GenericRowService } from './generic-row.service'
import { RowRegistry } from './row-registry'
import { RowsResolver } from './rows.resolver'

// The generic type-A engine: descriptor-driven reads (rows), live updates
// (rowUpdated), the flat applier, and the table registry. Writes ride the
// existing batch endpoint, which now resolves tables through this registry.
@Module({
  imports: [ContactsModule, SyncModule],
  providers: [GenericRowService, RowRegistry, RowsResolver],
  exports: [GenericRowService, RowRegistry],
})
export class EngineModule {}
