import { Injectable, ConflictException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import * as bcrypt from 'bcryptjs'
import { UserEntity } from '@gammaray/database'

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repo: Repository<UserEntity>,
  ) {}

  async create(email: string, password: string): Promise<UserEntity> {
    const existing = await this.repo.findOneBy({ email })
    if (existing) throw new ConflictException('Email already registered')
    const passwordHash = await bcrypt.hash(password, 12)
    return this.repo.save(this.repo.create({ email, passwordHash }))
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.repo.findOneBy({ email })
  }

  async findById(id: string): Promise<UserEntity | null> {
    return this.repo.findOneBy({ id })
  }

  async validatePassword(user: UserEntity, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash)
  }
}
