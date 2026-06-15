import { ObjectType, InputType, Field, ID, Int, registerEnumType } from '@nestjs/graphql'
import GraphQLJSON from 'graphql-type-json'
import { IsInt, IsString } from 'class-validator'

export enum ChangeOpGql {
  UPSERT = 'UPSERT',
  DELETE = 'DELETE',
}
registerEnumType(ChangeOpGql, { name: 'ChangeOp' })

export enum ChangeStatusGql {
  APPLIED = 'APPLIED',
  CONFLICT = 'CONFLICT',
  REJECTED = 'REJECTED',
}
registerEnumType(ChangeStatusGql, { name: 'ChangeStatus' })

@InputType('RowChange')
export class RowChangeGql {
  @Field()
  @IsString()
  table!: string

  @Field(() => ID)
  @IsString()
  id!: string

  @Field(() => ChangeOpGql)
  op!: ChangeOpGql

  /** The row's descriptor fields (generic across tables). */
  @Field(() => GraphQLJSON)
  data!: Record<string, unknown>

  @Field(() => Int)
  @IsInt()
  expectedVersion!: number
}

@ObjectType('RowResult')
export class RowResultGql {
  @Field()
  table!: string

  @Field(() => ID)
  id!: string

  @Field(() => ChangeStatusGql)
  status!: ChangeStatusGql

  /** APPLIED: the new row; CONFLICT: the current server row. */
  @Field(() => GraphQLJSON, { nullable: true })
  row?: Record<string, unknown> | null

  @Field(() => Int, { nullable: true })
  serverVersion?: number | null

  @Field(() => String, { nullable: true })
  reason?: string | null
}

@ObjectType('BatchResult')
export class BatchResultGql {
  @Field(() => [RowResultGql])
  results!: RowResultGql[]
}
