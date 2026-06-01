import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'carcass_trait' })
@Index(['pigId'], { unique: true })
export class CarcassTraitEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  pigId!: number;

  @Column({ type: 'date', nullable: true })
  slaughterDate!: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  sex!: string | null;

  @Column({ type: 'float', nullable: true })
  preSlaughterWeightKg!: number | null;

  @Column({ type: 'float', nullable: true })
  carcassWeightLeftKg!: number | null;

  @Column({ type: 'float', nullable: true })
  carcassWeightRightKg!: number | null;

  @Column({ type: 'float', nullable: true })
  carcassLengthCm!: number | null;

  @Column({ type: 'float', nullable: true })
  bodyObliqueLengthCm!: number | null;

  @Column({ type: 'float', nullable: true })
  backfatShoulderMm!: number | null;

  @Column({ type: 'float', nullable: true })
  backfatLastRibMm!: number | null;

  @Column({ type: 'float', nullable: true })
  backfatLumbarMm!: number | null;

  @Column({ type: 'float', nullable: true })
  skinThickness6_7RibMm!: number | null;

  @Column({ type: 'float', nullable: true })
  emaLastRibCm2!: number | null;

  @Column({ type: 'float', nullable: true })
  emaHeightCm!: number | null;

  @Column({ type: 'float', nullable: true })
  emaWidthCm!: number | null;

  @Column({ type: 'float', nullable: true })
  leftDetachSkinKg!: number | null;

  @Column({ type: 'float', nullable: true })
  leftDetachBoneKg!: number | null;

  @Column({ type: 'float', nullable: true })
  leftDetachFatKg!: number | null;

  @Column({ type: 'float', nullable: true })
  leftDetachLeanKg!: number | null;

  @Column({ type: 'int', nullable: true })
  ribCount!: number | null;

  @Column({ type: 'float', nullable: true })
  detachLossPct!: number | null;

  @Column({ type: 'float', nullable: true })
  hoofWeightKg!: number | null;

  @Column({ type: 'float', nullable: true })
  headWeightKg!: number | null;

  @Column({ type: 'float', nullable: true })
  leftLegWeightKg!: number | null;

  @Column({ type: 'float', nullable: true })
  legHipRatioPct!: number | null;

  @Column({ type: 'float', nullable: true })
  skinRatePct!: number | null;

  @Column({ type: 'float', nullable: true })
  boneRatePct!: number | null;

  @Column({ type: 'float', nullable: true })
  fatRatePct!: number | null;

  @Column({ type: 'float', nullable: true })
  leanRatePct!: number | null;

  @Column({ type: 'float', nullable: true })
  slaughterRatePct!: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  remark!: string | null;
}
