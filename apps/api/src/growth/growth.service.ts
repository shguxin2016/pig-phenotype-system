import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DEFAULT_DTSW_TARGET_WEIGHT_KG_BY_BREED_NAME } from '@shapcd/pig-shared';
import { Repository } from 'typeorm';
import type { JwtPayload } from '../auth/auth.types';
import { BreedEntity, GrowthTestEntity, PigEntity } from '../db/entities';

type GrowthInput = {
  startDate?: string | null;
  startWeightKg?: number | null;
  endDate?: string | null;
  endWeightKg?: number | null;
  feedKg?: number | null;
  endBackfatMm?: number | null;
  endEmaCm2?: number | null;
  remark?: string | null;
};

const parseDate = (s: string): Date => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s))
    throw new BadRequestException('日期格式应为YYYY-MM-DD');
  return new Date(`${s}T00:00:00Z`);
};

const diffDays = (a: string, b: string): number => {
  const da = parseDate(a).getTime();
  const db = parseDate(b).getTime();
  return Math.round((da - db) / 86400000);
};

@Injectable()
export class GrowthService {
  constructor(
    @InjectRepository(GrowthTestEntity)
    private readonly growth: Repository<GrowthTestEntity>,
    @InjectRepository(PigEntity) private readonly pigs: Repository<PigEntity>,
    @InjectRepository(BreedEntity)
    private readonly breeds: Repository<BreedEntity>,
  ) {}

  async get(user: JwtPayload, pigId: number) {
    const pig = await this.requirePig(user, pigId);
    const record = await this.growth.findOne({ where: { pigId: pig.id } });
    return record ?? null;
  }

  async upsert(user: JwtPayload, pigId: number, input: GrowthInput) {
    const pig = await this.requirePig(user, pigId);
    const targetWeightKg = await this.getTargetWeightKg(pig.breedId);

    const record =
      (await this.growth.findOne({ where: { pigId: pig.id } })) ??
      this.growth.create({
        pigId: pig.id,
      });

    if (typeof input.startDate !== 'undefined')
      record.startDate = input.startDate ?? null;
    if (typeof input.endDate !== 'undefined')
      record.endDate = input.endDate ?? null;
    if (typeof input.startWeightKg !== 'undefined')
      record.startWeightKg = input.startWeightKg ?? null;
    if (typeof input.endWeightKg !== 'undefined')
      record.endWeightKg = input.endWeightKg ?? null;
    if (typeof input.feedKg !== 'undefined')
      record.feedKg = input.feedKg ?? null;
    if (typeof input.endBackfatMm !== 'undefined')
      record.endBackfatMm = input.endBackfatMm ?? null;
    if (typeof input.endEmaCm2 !== 'undefined')
      record.endEmaCm2 = input.endEmaCm2 ?? null;
    if (typeof input.remark !== 'undefined')
      record.remark = normalizeOptionalString(input.remark);

    this.computeDerived(pig, record, targetWeightKg);
    return this.growth.save(record);
  }

  private computeDerived(
    pig: PigEntity,
    record: GrowthTestEntity,
    targetWeightKg: number | null,
  ) {
    record.startAgeDays = record.startDate
      ? diffDays(record.startDate, pig.birthDate)
      : null;
    record.endAgeDays = record.endDate
      ? diffDays(record.endDate, pig.birthDate)
      : null;
    record.testDays =
      record.startDate && record.endDate
        ? diffDays(record.endDate, record.startDate)
        : null;

    const testDays = record.testDays;
    const startW = record.startWeightKg;
    const endW = record.endWeightKg;

    if (testDays != null && testDays > 0 && startW != null && endW != null) {
      const gain = endW - startW;
      record.adgG = gain > 0 ? (gain * 1000) / testDays : null;
      record.fcr =
        record.feedKg != null && gain > 0 ? record.feedKg / gain : null;
      record.adfiKg = record.feedKg != null ? record.feedKg / testDays : null;
    } else {
      record.adgG = null;
      record.adfiKg = null;
      record.fcr = null;
    }

    record.dtswDays = this.computeDtswDays(record, targetWeightKg);
  }

  private computeDtswDays(
    record: GrowthTestEntity,
    targetWeightKg: number | null,
  ): number | null {
    if (!record.startDate || !record.endDate) return null;
    if (record.testDays == null || record.testDays <= 0) return null;
    if (record.startAgeDays == null) return null;
    if (record.startWeightKg == null || record.endWeightKg == null) return null;

    if (!targetWeightKg) return null;

    const startW = record.startWeightKg;
    const endW = record.endWeightKg;
    if (endW < targetWeightKg) return null;

    const gain = endW - startW;
    if (gain <= 0) return null;

    const frac = (targetWeightKg - startW) / gain;
    if (frac < 0) return record.startAgeDays;
    if (frac > 1) return null;

    const daysToTarget = Math.round(frac * record.testDays);
    return record.startAgeDays + daysToTarget;
  }

  private async getTargetWeightKg(breedId: number): Promise<number | null> {
    const breed = await this.breeds.findOne({ where: { id: breedId } });
    if (!breed) return null;
    return (
      (DEFAULT_DTSW_TARGET_WEIGHT_KG_BY_BREED_NAME as any)[breed.name] ?? null
    );
  }

  private async requirePig(user: JwtPayload, pigId: number) {
    const pig = await this.pigs.findOne({ where: { id: pigId } });
    if (!pig) throw new NotFoundException('猪只不存在');
    if (user.role === '保种场' && pig.unitId !== user.unitId)
      throw new ForbiddenException('无权限访问该猪只');
    return pig;
  }
}

const normalizeOptionalString = (v: unknown): string | null => {
  if (typeof v !== 'string') return v == null ? null : String(v);
  const s = v.trim();
  return s.length === 0 ? null : s;
};
