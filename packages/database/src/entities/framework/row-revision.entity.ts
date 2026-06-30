import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm'
import { ConflictStatus } from '@gammaray/core'

// One generic revision log for every revisioned type-A table (replaces the
// per-table contact_revisions). A row is one accepted/detected version of some
// table's row, identified by (tableName, rowId). `data` is a field-aware JSONB
// snapshot — the common ancestor that 3-way merge reads.
@Entity('row_revisions')
@Index(['tableName', 'rowId', 'version'])
export class RowRevisionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'table_name' })
  tableName!: string

  @Column({ name: 'row_id' })
  rowId!: string

  /** Field-aware snapshot of the row at this version. */
  @Column({ type: 'jsonb', default: '{}' })
  data!: Record<string, unknown>

  @Column({ type: 'int' })
  version!: number

  @Column({ name: 'client_id' })
  clientId!: string

  @Column({
    type: 'enum',
    enum: ConflictStatus,
    default: ConflictStatus.None,
    name: 'conflict_status',
  })
  conflictStatus!: ConflictStatus

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date
}
