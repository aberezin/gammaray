import { ObjectType, Field, ID, Int } from '@nestjs/graphql'

@ObjectType()
export class CompanyModel {
  @Field(() => ID)
  id!: string

  @Field()
  name!: string

  @Field(() => Int)
  version!: number

  @Field()
  updatedAt!: string
}
