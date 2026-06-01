import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { JwtPayload } from '../auth/auth.types';
import { MeatQualityEntity, PigEntity } from '../db/entities';
import {
  type MeatqInput,
  computeMeatqWarnings,
  normalizeMeatqInput,
  validateMeatqStrong,
} from './meatq.logic';

export type MeatqResponse = { record: MeatQualityEntity; warnings: string[] };

@Injectable()
export class MeatqService {
  constructor(
    @InjectRepository(MeatQualityEntity)
    private readonly meatq: Repository<MeatQualityEntity>,
    @InjectRepository(PigEntity) private readonly pigs: Repository<PigEntity>,
  ) {}

  async get(user: JwtPayload, pigId: number): Promise<MeatqResponse | null> {
    await this.requirePig(user, pigId);
    const record = await this.meatq.findOne({ where: { pigId } });
    if (!record) return null;
    return { record, warnings: computeMeatqWarnings(record) };
  }

  async upsert(
    user: JwtPayload,
    pigId: number,
    input: MeatqInput,
  ): Promise<MeatqResponse> {
    await this.requirePig(user, pigId);

    const record =
      (await this.meatq.findOne({ where: { pigId } })) ??
      this.meatq.create({
        pigId,
      });

    Object.assign(record, normalizeMeatqInput(input));
    validateMeatqStrong(record);
    const warnings = computeMeatqWarnings(record);

    const saved = await this.meatq.save(record);
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
