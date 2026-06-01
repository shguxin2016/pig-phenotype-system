import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'repro_litter' })
@Index(['damEarTagNo', 'farrowingDate'], { unique: true })
export class ReproLitterEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  unitId!: number;

  @Column({ type: 'varchar', length: 100 })
  damEarTagNo!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  boarEarTagNo!: string | null;

  @Column({ type: 'date', nullable: true })
  matingDate!: string | null;

  @Column({ type: 'date' })
  farrowingDate!: string;

  @Column({ type: 'int', nullable: true })
  parity!: number | null;

  @Column({ type: 'int', nullable: true })
  totalBorn!: number | null;

  @Column({ type: 'int', nullable: true })
  maleBorn!: number | null;

  @Column({ type: 'int', nullable: true })
  femaleBorn!: number | null;

  @Column({ type: 'int', nullable: true })
  liveCount!: number | null;

  @Column({ type: 'int', nullable: true })
  weakCount!: number | null;

  @Column({ type: 'int', nullable: true })
  stillbornCount!: number | null;

  @Column({ type: 'int', nullable: true })
  mummyCount!: number | null;

  @Column({ type: 'int', nullable: true })
  malformedCount!: number | null;

  @Column({ type: 'date', nullable: true })
  weanDate!: string | null;

  @Column({ type: 'int', nullable: true })
  weanCount!: number | null;

  @Column({ type: 'float', nullable: true })
  weanLitterWeightKg!: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  remark!: string | null;
}
