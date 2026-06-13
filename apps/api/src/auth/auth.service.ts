import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { UsersService } from '../users/users.service'
import { UserEntity } from '@gammaray/database'
import { JwtPayload } from '@gammaray/auth'

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async register(email: string, password: string): Promise<{ accessToken: string }> {
    const user = await this.users.create(email, password)
    return { accessToken: this.sign(user) }
  }

  async login(email: string, password: string): Promise<{ accessToken: string }> {
    const user = await this.users.findByEmail(email)
    if (!user || !(await this.users.validatePassword(user, password))) {
      throw new UnauthorizedException('Invalid credentials')
    }
    return { accessToken: this.sign(user) }
  }

  private sign(user: UserEntity): string {
    const payload: JwtPayload = { sub: user.id, email: user.email }
    return this.jwt.sign(payload)
  }
}
