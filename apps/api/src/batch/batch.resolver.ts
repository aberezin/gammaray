import { Resolver, Mutation, Args } from '@nestjs/graphql'
import { UseGuards } from '@nestjs/common'
import { BatchService } from './batch.service'
import { BatchResultGql, RowChangeGql, RowResultGql, ChangeStatusGql } from './batch.model'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import type { RowChangeInput } from './batch.types'

@Resolver(() => BatchResultGql)
@UseGuards(JwtAuthGuard)
export class BatchResolver {
  constructor(private readonly batch: BatchService) {}

  @Mutation(() => BatchResultGql)
  async pushBatch(
    @Args({ name: 'changes', type: () => [RowChangeGql] }) changes: RowChangeGql[],
    @Args('clientId') clientId: string,
  ): Promise<BatchResultGql> {
    const input: RowChangeInput[] = changes.map((c) => ({
      table: c.table,
      id: c.id,
      op: c.op,
      data: c.data,
      expectedVersion: c.expectedVersion,
    }))
    const results = await this.batch.pushBatch(input, clientId)
    const out = new BatchResultGql()
    out.results = results.map((r) => {
      const row = new RowResultGql()
      row.table = r.table
      row.id = r.id
      row.status = r.status as ChangeStatusGql
      row.row = r.row ?? null
      row.serverVersion = r.serverVersion ?? null
      row.reason = r.reason ?? null
      return row
    })
    return out
  }
}
