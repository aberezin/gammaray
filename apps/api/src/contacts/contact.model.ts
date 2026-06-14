import { ObjectType, Field, ID, Int } from '@nestjs/graphql'

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
