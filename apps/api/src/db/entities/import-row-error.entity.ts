import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'import_row_error' })
@Index(['batchId'])
export class ImportRowErrorEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  batchId!: number;

  @Column({ type: 'int' })
  rowNumber!: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  field!: string | null;

  @Column({ type: 'text' })
  message!: string;
}
