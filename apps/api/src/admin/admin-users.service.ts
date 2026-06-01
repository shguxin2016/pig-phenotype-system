import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { hashPassword } from '../auth/password';
import { UnitEntity, UserEntity } from '../db/entities';

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(UnitEntity)
    private readonly units: Repository<UnitEntity>,
  ) {}

  async listUnits(): Promise<{ id: number; name: string; type: string }[]> {
    const units = await this.units.find({ order: { id: 'ASC' } });
    return units.map((u) => ({ id: u.id, name: u.name, type: u.type }));
  }

  async listUsers(): Promise<
    {
      id: number;
      username: string;
      unitId: number;
      unitName: string;
      role: string;
      isActive: boolean;
    }[]
  > {
    const users = await this.users.find({ order: { unitId: 'ASC' } });
    const units = await this.units.find();
    const unitNameById = new Map(units.map((u) => [u.id, u.name] as const));

    return users.map((u) => ({
      id: u.id,
      username: u.username,
      unitId: u.unitId,
      unitName: unitNameById.get(u.unitId) ?? '',
      role: u.role,
      isActive: u.isActive,
    }));
  }

  async createUser(input: {
    unitId: number;
    username: string;
    password?: string;
  }): Promise<{
    id: number;
    username: string;
    unitId: number;
    role: string;
    isActive: boolean;
    initialPassword?: string;
  }> {
    const unit = await this.units.findOne({ where: { id: input.unitId } });
    if (!unit) throw new BadRequestException('单位不存在');

    const existing = await this.users.findOne({
      where: { unitId: input.unitId },
    });
    if (existing) throw new ConflictException('该单位账号已存在');

    const role = unit.type;
    const initialPassword =
      input.password ?? randomBytes(18).toString('base64url');
    const passwordHash = await hashPassword(initialPassword);

    const user = await this.users.save(
      this.users.create({
        username: input.username,
        unitId: input.unitId,
        role,
        passwordHash,
        isActive: true,
      }),
    );

    return {
      id: user.id,
      username: user.username,
      unitId: user.unitId,
      role: user.role,
      isActive: user.isActive,
      initialPassword,
    };
  }

  async updateUser(
    userId: number,
    input: { username?: string; isActive?: boolean },
  ): Promise<{
    id: number;
    username: string;
    unitId: number;
    role: string;
    isActive: boolean;
  }> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('账号不存在');

    if (typeof input.username === 'string') {
      if (input.username.trim().length === 0)
        throw new BadRequestException('用户名不能为空');
      user.username = input.username.trim();
    }
    if (typeof input.isActive === 'boolean') {
      user.isActive = input.isActive;
    }

    const updated = await this.users.save(user);
    return {
      id: updated.id,
      username: updated.username,
      unitId: updated.unitId,
      role: updated.role,
      isActive: updated.isActive,
    };
  }

  async resetPassword(
    userId: number,
    input: { password?: string },
  ): Promise<{ id: number; initialPassword: string }> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('账号不存在');

    const initialPassword =
      input.password ?? randomBytes(18).toString('base64url');
    user.passwordHash = await hashPassword(initialPassword);
    await this.users.save(user);
    return { id: user.id, initialPassword };
  }
}
