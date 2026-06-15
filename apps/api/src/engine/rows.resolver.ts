import { Resolver, Query, Subscription, Args } from '@nestjs/graphql'
import { UseGuards, BadRequestException } from '@nestjs/common'
import GraphQLJSON from 'graphql-type-json'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { SyncBroker } from '../sync/sync.broker'
import { RowRegistry } from './row-registry'
import { GenericRowService } from './generic-row.service'

// The generic read/live surface for every type-A table. Replaces the per-table
// typed `<list>` queries and `<x>Updated` subscriptions with one descriptor-
// driven pair over a JSON scalar (writes already go through the generic
// pushBatch). See ADR 0009 for why JSON rather than dynamic typed schema.
@Resolver()
@UseGuards(JwtAuthGuard)
export class RowsResolver {
  constructor(
    private readonly registry: RowRegistry,
    private readonly generic: GenericRowService,
    private readonly broker: SyncBroker,
  ) {}

  @Query(() => [GraphQLJSON], { name: 'rows' })
  async rows(@Args('table') table: string): Promise<Record<string, unknown>[]> {
    const entry = this.registry.get(table)
    if (!entry) throw new BadRequestException(`unknown table: ${table}`)
    return this.generic.listRows(entry.descriptor, entry.entity)
  }

  @Subscription(() => GraphQLJSON, {
    name: 'rowUpdated',
    // One channel for all tables; deliver only the requested table's rows.
    filter: (payload: { table: string }, variables: { table: string }) => payload.table === variables.table,
    resolve: (payload: { row: Record<string, unknown> }) => payload.row,
  })
  rowUpdated(@Args('table') _table: string) {
    return this.broker.rowAsyncIterator()
  }
}
