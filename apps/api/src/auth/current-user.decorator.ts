import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { GqlExecutionContext } from '@nestjs/graphql'
import { UserEntity } from '@gammaray/database'

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserEntity => {
    const gql = GqlExecutionContext.create(ctx)
    return gql.getContext().req.user
  },
)
