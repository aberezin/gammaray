import { ObjectType, Field, ID, Int } from '@nestjs/graphql'

@ObjectType()
export class TagModel {
  @Field(() => ID)
  id!: string

  @Field()
  name!: string

  @Field(() => Int)
  version!: number

  @Field()
  deleted!: boolean

  @Field()
  updatedAt!: string
}
