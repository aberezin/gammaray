import { ObjectType, Field, ID, Int } from '@nestjs/graphql'

@ObjectType()
export class CategoryModel {
  @Field(() => ID)
  id!: string

  @Field()
  name!: string

  @Field(() => ID, { nullable: true })
  parentId?: string | null

  @Field(() => Int)
  version!: number

  @Field()
  deleted!: boolean

  @Field()
  updatedAt!: string
}
