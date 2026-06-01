import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { JwtPayload } from '../auth/auth.types';
import { CarcassTraitEntity, PigEntity } from '../db/entities';
import {
  type CarcassInput,
  computeCarcassDerived,
  normalizeCarcassInput,
  validateCarcassBasic,
  validateCarcassLogical,
} from './carcass.logic';

export type CarcassResponse = {
  record: CarcassTraitEntity;
  warnings: string[];
};

@Injectable()
export class CarcassService {
  constructor(
    @InjectRepository(CarcassTraitEntity)
    private readonly carcass: Repository<CarcassTraitEntity>,
    @InjectRepository(PigEntity) private readonly pigs: Repository<PigEntity>,
  ) {}

  async get(user: JwtPayload, pigId: number): Promise<CarcassResponse | null> {
    await this.requirePig(user, pigId);
    const record = await this.carcass.findOne({ where: { pigId } });
    if (!record) return null;
    const { warnings } = computeCarcassDerived(record);
    return { record, warnings };
  }

  async upsert(
    user: JwtPayload,
    pigId: number,
    input: CarcassInput,
  ): Promise<CarcassResponse> {
    await this.requirePig(user, pigId);

    const record =
      (await this.carcass.findOne({ where: { pigId } })) ??
      this.carcass.create({
        pigId,
      });

    Object.assign(record, normalizeCarcassInput(input));
    validateCarcassBasic(record);

    const { warnings } = computeCarcassDerived(record);
    validateCarcassLogical(record);

    const saved = await this.carcass.save(record);
    return { record: saved, warnings };
  }

  private async requirePig(user: JwtPayload, pigId: number) {
    const pig = await this.pigs.findOne({ where: { id: pigId } });
    if (!pig) throw new NotFoundException('猪只不存在');
    if (user.role === '保种场' && pig.unitId !== user.unitId)
      throw new ForbiddenException('无权限访问该猪只');
    return pig;
  }
}
