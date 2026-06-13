import { Module } from '@nestjs/common'
import { SyncBroker } from './sync.broker'

@Module({
  providers: [SyncBroker],
  exports: [SyncBroker],
})
export class SyncModule {}
