import { ObjectType, InputType, Field, ID, Int } from '@nestjs/graphql'
import { IsString, IsUUID } from 'class-validator'

@InputType()
export class ContactInput {
  // class-validator decorators are required: the global ValidationPipe runs with
  // whitelist:true, which strips any property without one.
  @Field(() => ID)
  @IsUUID()
  id!: string

  @Field()
  @IsString()
  firstName!: string

  @Field()
  @IsString()
  lastName!: string

  @Field()
  @IsString()
  email!: string

  @Field()
  @IsString()
  phone!: string
}

@ObjectType()
export class ContactConflictResult {
  @Field()
  conflict!: boolean

  @Field(() => ContactModel, { nullable: true })
  contact?: ContactModel | null

  /** Set when a conflict is detected (Update increment). */
  @Field(() => Int, { nullable: true })
  serverVersion?: number | null

  /** Server's JSON snapshot when a conflict was detected (Update increment). */
  @Field(() => String, { nullable: true })
  serverData?: string | null
}

@ObjectType()
export class ContactModel {
  @Field(() => ID)
  id!: string

  @Field()
  firstName!: string

  @Field()
  lastName!: string

  @Field()
  email!: string

  @Field()
  phone!: string

  @Field(() => Int)
  version!: number

  @Field()
  createdAt!: string

  @Field()
  updatedAt!: string
}

@ObjectType()
export class ContactRevisionModel {
  @Field(() => ID)
  id!: string

  @Field(() => ID)
  contactId!: string

  /** JSON-encoded snapshot of the row's fields at this version. */
  @Field()
  data!: string

  @Field(() => Int)
  version!: number

  @Field()
  clientId!: string

  @Field()
  conflictStatus!: string

  @Field()
  createdAt!: string
}
