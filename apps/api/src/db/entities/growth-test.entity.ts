import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'growth_test' })
@Index(['pigId'], { unique: true })
export class GrowthTestEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  pigId!: number;

  @Column({ type: 'date', nullable: true })
  startDate!: string | null;

  @Column({ type: 'int', nullable: true })
  startAgeDays!: number | null;

  @Column({ type: 'float', nullable: true })
  startWeightKg!: number | null;

  @Column({ type: 'date', nullable: true })
  endDate!: string | null;

  @Column({ type: 'int', nullable: true })
  endAgeDays!: number | null;

  @Column({ type: 'float', nullable: true })
  endWeightKg!: number | null;

  @Column({ type: 'int', nullable: true })
  testDays!: number | null;

  @Column({ type: 'float', nullable: true })
  feedKg!: number | null;

  @Column({ type: 'float', nullable: true })
  adgG!: number | null;

  @Column({ type: 'float', nullable: true })
  adfiKg!: number | null;

  @Column({ type: 'float', nullable: true })
  fcr!: number | null;

  @Column({ type: 'int', nullable: true })
  dtswDays!: number | null;

  @Column({ type: 'float', nullable: true })
  endBackfatMm!: number | null;

  @Column({ type: 'float', nullable: true })
  endEmaCm2!: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  remark!: string | null;
}
