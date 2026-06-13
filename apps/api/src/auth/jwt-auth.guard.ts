import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { GqlExecutionContext } from '@nestjs/graphql'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  getRequest(context: ExecutionContext) {
    // REST controllers use HTTP context; GraphQL resolvers use GQL context
    if (context.getType<string>() === 'graphql') {
      return GqlExecutionContext.create(context).getContext().req
    }
    return context.switchToHttp().getRequest()
  }

  handleRequest<TUser = unknown>(err: unknown, user: TUser): TUser {
    if (err || !user) throw err ?? new UnauthorizedException()
    return user
  }
}
