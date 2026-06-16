import { Entity, PrimaryColumn, Column } from 'typeorm'

// Singleton row (id always 1) holding the server's "data epoch" — an id for the
// current dataset generation. It is bumped by out-of-app changes that actually
// mutate data (migrations applied, seed created/reset rows, manual bump), so
// clients can detect a server reset and reslate their local replica (ADR 0012).
@Entity('app_meta')
export class AppMetaEntity {
  @PrimaryColumn({ type: 'int', default: 1 })
  id!: number

  @Column({ type: 'uuid' })
  epoch!: string

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date
}
