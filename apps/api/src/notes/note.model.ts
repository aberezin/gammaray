import { ObjectType, Field, ID, Int } from '@nestjs/graphql'

@ObjectType()
export class NoteModel {
  @Field(() => ID)
  id!: string

  @Field()
  content!: string

  @Field(() => Int)
  version!: number

  @Field()
  updatedAt!: string
}

@ObjectType()
export class RevisionModel {
  @Field(() => ID)
  id!: string

  @Field(() => ID)
  noteId!: string

  @Field()
  content!: string

  @Field(() => Int)
  version!: number

  @Field()
  clientId!: string

  @Field()
  conflictStatus!: string

  @Field(() => String, { nullable: true })
  resolvedContent?: string | null

  @Field()
  createdAt!: string
}

@ObjectType()
export class ConflictResultModel {
  @Field()
  conflict!: boolean

  @Field(() => NoteModel, { nullable: true })
  note?: NoteModel | null

  @Field(() => RevisionModel, { nullable: true })
  revision?: RevisionModel | null

  @Field(() => Int, { nullable: true })
  serverVersion?: number | null

  @Field(() => String, { nullable: true })
  serverContent?: string | null
}
