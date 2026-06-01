import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'repro_piglet' })
@Index(['pigId'], { unique: true })
export class ReproPigletEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  litterId!: number;

  @Column({ type: 'int' })
  pigId!: number;

  @Column({ type: 'float', nullable: true })
  birthWeightKg!: number | null;

  @Column({ type: 'int', nullable: true })
  leftTeats!: number | null;

  @Column({ type: 'int', nullable: true })
  rightTeats!: number | null;

  @Column({ type: 'float', nullable: true })
  weanWeightIndKg!: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  remark!: string | null;
}
