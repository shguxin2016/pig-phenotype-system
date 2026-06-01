import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type Role = '保种场' | '测定中心' | '管理单位';

@Entity({ name: 'user' })
@Index(['username', 'unitId'], { unique: true })
export class UserEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 100 })
  username!: string;

  @Index({ unique: true })
  @Column({ type: 'int' })
  unitId!: number;

  @Column({ type: 'varchar', length: 20 })
  role!: Role;

  @Column({ type: 'varchar', length: 200 })
  passwordHash!: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;
}
