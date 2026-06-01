import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type Sex = '公' | '母' | '未知';

@Entity({ name: 'pig' })
@Index(['unitId', 'individualNo'], { unique: true })
export class PigEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  unitId!: number;

  @Column({ type: 'int' })
  breedId!: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  individualNo!: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  earTagNo!: string;

  @Column({ type: 'varchar', length: 10 })
  sex!: Sex;

  @Column({ type: 'date' })
  birthDate!: string;

  @Column({ type: 'float', nullable: true })
  birthWeightKg!: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  damEarTagNo!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  remark!: string | null;
}
