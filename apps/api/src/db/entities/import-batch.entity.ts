import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ImportBatchStatus = 'validated' | 'committed' | 'failed';

@Entity({ name: 'import_batch' })
@Index(['module', 'unitId', 'year', 'createdAt'])
export class ImportBatchEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  unitId!: number;

  @Column({ type: 'int' })
  userId!: number;

  @Column({ type: 'int', nullable: true })
  year!: number | null;

  @Column({ type: 'varchar', length: 50 })
  module!: string;

  @Column({ type: 'varchar', length: 20 })
  status!: ImportBatchStatus;

  @Column({ type: 'varchar', length: 200 })
  filename!: string;

  @Column({ type: 'int', default: 0 })
  totalRows!: number;

  @Column({ type: 'int', default: 0 })
  validRows!: number;

  @Column({ type: 'int', default: 0 })
  errorRows!: number;

  @Column({ type: 'int', default: 0 })
  warningsCount!: number;

  @Column({ type: 'simple-json', nullable: true })
  payloadJson!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;
}
