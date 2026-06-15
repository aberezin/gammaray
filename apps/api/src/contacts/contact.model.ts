import { ObjectType, InputType, Field, ID, Int } from '@nestjs/graphql'
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator'

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

  /** Soft many-to-one reference to a company (null = none). */
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsUUID()
  companyId?: string | null

  /** A delete push sets this; create/update leave it false. */
  @Field(() => Boolean, { defaultValue: false })
  @IsBoolean()
  deleted!: boolean
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

  @Field(() => ID, { nullable: true })
  companyId?: string | null

  @Field()
  deleted!: boolean

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
