import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { UsersService } from '../users/users.service'
import { JwtPayload } from '@gammaray/auth'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly users: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'dev-secret',
    })
  }

  async validate(payload: JwtPayload) {
    // A refresh token is signed with the same secret but must never authorize an
    // API call — it is only valid at /auth/refresh.
    if (payload.type === 'refresh') throw new UnauthorizedException()
    const user = await this.users.findById(payload.sub)
    if (!user) throw new UnauthorizedException()
    return user
  }
}
