import { ObjectType, Field, ID, Int } from '@nestjs/graphql'

@ObjectType()
export class ContactTagModel {
  @Field(() => ID)
  id!: string

  @Field(() => ID)
  contactId!: string

  @Field(() => ID)
  tagId!: string

  @Field(() => Int)
  version!: number

  @Field()
  deleted!: boolean

  @Field()
  updatedAt!: string
}
