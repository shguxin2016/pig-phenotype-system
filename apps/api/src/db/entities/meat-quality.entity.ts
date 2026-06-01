import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'meat_quality' })
@Index(['pigId'], { unique: true })
export class MeatQualityEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  pigId!: number;

  @Column({ type: 'varchar', length: 10, nullable: true })
  sex!: string | null;

  @Column({ type: 'float', nullable: true })
  colorScore!: number | null;

  @Column({ type: 'float', nullable: true })
  colorL!: number | null;

  @Column({ type: 'float', nullable: true })
  colorA!: number | null;

  @Column({ type: 'float', nullable: true })
  colorB!: number | null;

  @Column({ type: 'float', nullable: true })
  ph1h!: number | null;

  @Column({ type: 'float', nullable: true })
  ph24h!: number | null;

  @Column({ type: 'float', nullable: true })
  dripLossPct!: number | null;

  @Column({ type: 'float', nullable: true })
  waterHoldingPct!: number | null;

  @Column({ type: 'float', nullable: true })
  marblingScore!: number | null;

  @Column({ type: 'float', nullable: true })
  imfPct!: number | null;

  @Column({ type: 'float', nullable: true })
  impPct!: number | null;

  @Column({ type: 'float', nullable: true })
  moisturePct!: number | null;

  @Column({ type: 'float', nullable: true })
  tendernessShearN!: number | null;

  @Column({ type: 'float', nullable: true })
  cookedMeatRate!: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  remark!: string | null;
}
