import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { JwtPayload } from '../auth/auth.types';
import {
  PigEntity,
  ReproLitterEntity,
  ReproPigletEntity,
} from '../db/entities';

type LitterInput = {
  damEarTagNo: string;
  farrowingDate: string;
  boarEarTagNo?: string | null;
  matingDate?: string | null;
  parity?: number | null;
  maleBorn?: number | null;
  femaleBorn?: number | null;
  stillbornCount?: number | null;
  mummyCount?: number | null;
  malformedCount?: number | null;
  weakCount?: number | null;
  weanDate?: string | null;
  weanCount?: number | null;
  weanLitterWeightKg?: number | null;
  remark?: string | null;
};

type PigletInput = {
  birthWeightKg?: number | null;
  leftTeats?: number | null;
  rightTeats?: number | null;
  weanWeightIndKg?: number | null;
  remark?: string | null;
};

@Injectable()
export class ReproService {
  constructor(
    @InjectRepository(ReproLitterEntity)
    private readonly litters: Repository<ReproLitterEntity>,
    @InjectRepository(ReproPigletEntity)
    private readonly piglets: Repository<ReproPigletEntity>,
    @InjectRepository(PigEntity) private readonly pigs: Repository<PigEntity>,
  ) {}

  async get(user: JwtPayload, pigId: number) {
    const pig = await this.requirePig(user, pigId);
    const piglet = await this.piglets.findOne({ where: { pigId: pig.id } });
    if (!piglet) return null;
    const litter = await this.litters.findOne({
      where: { id: piglet.litterId },
    });
    if (!litter) return null;
    return { litter, piglet };
  }

  async upsert(
    user: JwtPayload,
    pigId: number,
    input: {
      litter: LitterInput;
      piglet: PigletInput;
      allowUpdateShared?: boolean;
    },
  ) {
    const pig = await this.requirePig(user, pigId);

    const litterInput = normalizeLitterInput(input.litter);
    const pigletInput = normalizePigletInput(input.piglet);
    validateLitterInput(litterInput);

    const computed = computeLitterCounts(litterInput);

    const existing = await this.litters.findOne({
      where: {
        damEarTagNo: litterInput.damEarTagNo,
        farrowingDate: litterInput.farrowingDate,
      },
    });

    const litter = existing
      ? await this.updateExistingLitter(
          existing,
          pig.unitId,
          { ...litterInput, ...computed },
          input.allowUpdateShared === true,
        )
      : await this.litters.save(
          this.litters.create({
            unitId: pig.unitId,
            damEarTagNo: litterInput.damEarTagNo,
            farrowingDate: litterInput.farrowingDate,
            boarEarTagNo: litterInput.boarEarTagNo ?? null,
            matingDate: litterInput.matingDate ?? null,
            parity: litterInput.parity ?? null,
            maleBorn: computed.maleBorn,
            femaleBorn: computed.femaleBorn,
            totalBorn: computed.totalBorn,
            stillbornCount: computed.stillbornCount,
            mummyCount: computed.mummyCount,
            malformedCount: computed.malformedCount,
            liveCount: computed.liveCount,
            weakCount: computed.weakCount,
            weanDate: litterInput.weanDate ?? null,
            weanCount: litterInput.weanCount ?? null,
            weanLitterWeightKg: litterInput.weanLitterWeightKg ?? null,
            remark: litterInput.remark ?? null,
          }),
        );

    const existingPiglet = await this.piglets.findOne({
      where: { pigId: pig.id },
    });
    const piglet = existingPiglet
      ? await this.piglets.save(
          Object.assign(existingPiglet, {
            litterId: litter.id,
            ...pigletInput,
          }),
        )
      : await this.piglets.save(
          this.piglets.create({
            litterId: litter.id,
            pigId: pig.id,
            ...pigletInput,
          }),
        );

    return { litter, piglet };
  }

  private async updateExistingLitter(
    existing: ReproLitterEntity,
    unitId: number,
    next: Partial<ReproLitterEntity>,
    allowUpdateShared: boolean,
  ) {
    if (existing.unitId !== unitId) {
      existing.unitId = unitId;
    }

    const diffs = diffLitter(existing, next);
    if (diffs.length > 0 && !allowUpdateShared) {
      const linkedCount = await this.piglets.count({
        where: { litterId: existing.id },
      });
      if (linkedCount > 1) {
        throw new ConflictException({ message: '同一窝记录冲突', diffs });
      }
    }

    Object.assign(existing, next);
    return this.litters.save(existing);
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

const normalizeLitterInput = (i: LitterInput): LitterInput => ({
  ...i,
  damEarTagNo: i.damEarTagNo?.trim?.() ?? String(i.damEarTagNo ?? ''),
  farrowingDate: i.farrowingDate?.trim?.() ?? String(i.farrowingDate ?? ''),
  boarEarTagNo: normalizeOptionalString(i.boarEarTagNo),
  matingDate: normalizeOptionalString(i.matingDate),
  weanDate: normalizeOptionalString(i.weanDate),
  remark: normalizeOptionalString(i.remark),
});

const normalizePigletInput = (i: PigletInput): PigletInput => ({
  birthWeightKg: i.birthWeightKg ?? null,
  leftTeats: i.leftTeats ?? null,
  rightTeats: i.rightTeats ?? null,
  weanWeightIndKg: i.weanWeightIndKg ?? null,
  remark: normalizeOptionalString(i.remark),
});

const validateLitterInput = (i: LitterInput) => {
  if (!i.damEarTagNo || i.damEarTagNo.trim().length === 0)
    throw new BadRequestException('母猪耳号必填');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.farrowingDate))
    throw new BadRequestException('分娩日期格式应为YYYY-MM-DD');
};

const computeLitterCounts = (i: LitterInput) => {
  const maleBorn = toIntOrNull(i.maleBorn);
  const femaleBorn = toIntOrNull(i.femaleBorn);
  const stillbornCount = toIntOrNull(i.stillbornCount);
  const mummyCount = toIntOrNull(i.mummyCount);
  const malformedCount = toIntOrNull(i.malformedCount);
  const weakCount = toIntOrNull(i.weakCount);

  const totalBorn =
    maleBorn != null && femaleBorn != null ? maleBorn + femaleBorn : null;

  const liveCount =
    totalBorn != null &&
    stillbornCount != null &&
    mummyCount != null &&
    malformedCount != null
      ? totalBorn - stillbornCount - mummyCount - malformedCount
      : null;

  if (liveCount != null && weakCount != null && weakCount > liveCount) {
    throw new BadRequestException('弱仔数不能大于活仔数');
  }

  return {
    maleBorn,
    femaleBorn,
    totalBorn,
    stillbornCount,
    mummyCount,
    malformedCount,
    liveCount,
    weakCount,
  };
};

const toIntOrNull = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
};

const eq = (a: unknown, b: unknown) => {
  if (a == null && b == null) return true;
  return a === b;
};

const diffLitter = (a: ReproLitterEntity, b: Partial<ReproLitterEntity>) => {
  const diffs: { field: string; existing: unknown; incoming: unknown }[] = [];
  const fields: (keyof ReproLitterEntity)[] = [
    'damEarTagNo',
    'boarEarTagNo',
    'matingDate',
    'farrowingDate',
    'parity',
    'maleBorn',
    'femaleBorn',
    'totalBorn',
    'stillbornCount',
    'mummyCount',
    'malformedCount',
    'liveCount',
    'weakCount',
    'weanDate',
    'weanCount',
    'weanLitterWeightKg',
  ];

  for (const f of fields) {
    if (typeof b[f] === 'undefined') continue;
    if (!eq(a[f], b[f])) {
      diffs.push({ field: String(f), existing: a[f], incoming: b[f] });
    }
  }
  return diffs;
};
