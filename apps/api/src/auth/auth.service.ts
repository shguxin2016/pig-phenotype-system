import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnitEntity, UserEntity } from '../db/entities';
import { verifyPassword } from './password';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(UnitEntity)
    private readonly units: Repository<UnitEntity>,
    private readonly jwt: JwtService,
  ) {}

  async login(input: {
    username: string;
    unitName: string;
    password: string;
  }): Promise<{
    accessToken: string;
    user: { id: number; username: string; unitId: number; role: string };
  }> {
    const unit = await this.units.findOne({ where: { name: input.unitName } });
    if (!unit) throw new UnauthorizedException('单位不存在');

    const user = await this.users.findOne({ where: { unitId: unit.id } });
    if (!user) throw new UnauthorizedException('账号不存在');
    if (!user.isActive) throw new UnauthorizedException('账号已停用');
    if (user.username !== input.username)
      throw new UnauthorizedException('用户名或单位不正确');

    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('密码不正确');

    const payload = {
      sub: user.id,
      unitId: user.unitId,
      role: user.role,
      username: user.username,
    };
    const accessToken = await this.jwt.signAsync(payload);
    return {
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        unitId: user.unitId,
        role: user.role,
      },
    };
  }
}
