import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { UsersService } from '../users/users.service'
import { UserEntity } from '@gammaray/database'
import { JwtPayload } from '@gammaray/auth'

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

// Refresh tokens are stateless JWTs (same secret, longer life, marked
// type:'refresh'), in keeping with the no-server-session design. They are only
// accepted at /auth/refresh — the JwtStrategy rejects them as bearer tokens.
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? '7d'

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async register(email: string, password: string): Promise<TokenPair> {
    const user = await this.users.create(email, password)
    return this.issue(user)
  }

  async login(email: string, password: string): Promise<TokenPair> {
    const user = await this.users.findByEmail(email)
    if (!user || !(await this.users.validatePassword(user, password))) {
      throw new UnauthorizedException('Invalid credentials')
    }
    return this.issue(user)
  }

  // Exchange a valid refresh token for a fresh token pair (sliding rotation).
  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload
    try {
      payload = this.jwt.verify<JwtPayload>(refreshToken)
    } catch {
      throw new UnauthorizedException('Invalid refresh token')
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Not a refresh token')
    }
    const user = await this.users.findById(payload.sub)
    if (!user) throw new UnauthorizedException('Unknown user')
    return this.issue(user)
  }

  private issue(user: UserEntity): TokenPair {
    const base: JwtPayload = { sub: user.id, email: user.email }
    return {
      accessToken: this.jwt.sign({ ...base, type: 'access' }),
      refreshToken: this.jwt.sign({ ...base, type: 'refresh' }, { expiresIn: REFRESH_EXPIRES_IN }),
    }
  }
}
