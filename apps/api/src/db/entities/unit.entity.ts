import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type UnitType = '保种场' | '测定中心' | '管理单位';

@Entity({ name: 'unit' })
export class UnitEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 20 })
  type!: UnitType;

  @Column({ type: 'int', nullable: true })
  defaultBreedId!: number | null;
}
