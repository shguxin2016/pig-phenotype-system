import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'conservation_base_info' })
@Index(['unitId', 'year'], { unique: true })
export class ConservationBaseInfoEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  unitId!: number;

  @Column({ type: 'int' })
  year!: number;

  @Column({ type: 'simple-json' })
  data!: Record<string, unknown>;

  @Column({ type: 'date', nullable: true })
  fillDate!: string | null;
}
