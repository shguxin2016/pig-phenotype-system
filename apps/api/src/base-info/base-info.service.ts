import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { JwtPayload } from '../auth/auth.types';
import { ConservationBaseInfoEntity, UnitEntity } from '../db/entities';

type UpsertBody = { data: Record<string, unknown> };
export type BaseInfoRecord = {
  id: number;
  unitId: number;
  year: number;
  data: Record<string, unknown>;
  fillDate: string | null;
};
export type BaseInfoResponse = { record: BaseInfoRecord; warnings: string[] };

const YEAR_MIN = 2000;
const YEAR_MAX = 2100;
const LEVELS = new Set(['国家级', '省级', '其他']);

const numberKeys = [
  'technicianCount',
  'inStockCount',
  'familyCount',
  'breedingCount',
  'breedingMaleCount',
  'breedingFemaleBaseCount',
  'reserveCount',
  'reserveMaleCount',
  'reserveFemaleCount',
  'landAreaM2',
  'housingAreaM2',
  'fixedAssets10kCny',
] as const;

@Injectable()
export class BaseInfoService {
  constructor(
    @InjectRepository(ConservationBaseInfoEntity)
    private readonly repo: Repository<ConservationBaseInfoEntity>,
    @InjectRepository(UnitEntity)
    private readonly units: Repository<UnitEntity>,
  ) {}

  async get(
    user: JwtPayload,
    yearStr: string,
    unitIdStr?: string,
  ): Promise<BaseInfoRecord | null> {
    const year = parseYear(yearStr);
    const unitId = this.resolveUnitIdForRead(user, unitIdStr);
    const row = await this.repo.findOne({ where: { unitId, year } });
    if (!row) return null;
    return {
      id: row.id,
      unitId: row.unitId,
      year: row.year,
      data: row.data,
      fillDate: row.fillDate,
    };
  }

  async upsert(
    user: JwtPayload,
    yearStr: string,
    unitIdStr: string | undefined,
    body: unknown,
  ): Promise<BaseInfoResponse> {
    const year = parseYear(yearStr);
    const unitId = this.resolveUnitIdForWrite(user, unitIdStr);
    await this.assertUnitExists(unitId);

    if (!body || typeof body !== 'object')
      throw new BadRequestException('body无效');

    const data = (body as any).data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new BadRequestException('data必须为对象');
    }

    const warnings: string[] = [];
    validateStrong(data as Record<string, unknown>);
    validateWarnings(data as Record<string, unknown>, warnings);

    const fillDate = normalizeOptionalString((data as any).fillDate);
    if (fillDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(fillDate)) {
      throw new BadRequestException('fillDate格式应为YYYY-MM-DD');
    }

    const row =
      (await this.repo.findOne({ where: { unitId, year } })) ??
      this.repo.create({ unitId, year, data: {}, fillDate: null });

    row.data = data as any;
    row.fillDate = fillDate;

    const saved = await this.repo.save(row);
    return {
      record: {
        id: saved.id,
        unitId: saved.unitId,
        year: saved.year,
        data: saved.data,
        fillDate: saved.fillDate,
      },
      warnings,
    };
  }

  private resolveUnitIdForRead(user: JwtPayload, unitIdStr?: string): number {
    if (user.role === '保种场') return user.unitId;
    if (user.role === '测定中心') {
      if (!unitIdStr) throw new BadRequestException('unitId必填');
      return parseUnitId(unitIdStr);
    }
    if (user.role === '管理单位') {
      if (unitIdStr) return parseUnitId(unitIdStr);
      return user.unitId;
    }
    throw new ForbiddenException('无权限');
  }

  private resolveUnitIdForWrite(user: JwtPayload, unitIdStr?: string): number {
    if (user.role === '测定中心') throw new ForbiddenException('无权限');
    if (user.role === '保种场') return user.unitId;
    if (user.role === '管理单位') {
      if (unitIdStr) return parseUnitId(unitIdStr);
      return user.unitId;
    }
    throw new ForbiddenException('无权限');
  }

  private async assertUnitExists(unitId: number) {
    const unit = await this.units.findOne({ where: { id: unitId } });
    if (!unit) throw new BadRequestException('unitId不存在');
  }
}

const parseYear = (s: string): number => {
  const n = Number(s);
  if (!Number.isFinite(n) || Math.trunc(n) !== n)
    throw new BadRequestException('year必须为整数');
  if (n < YEAR_MIN || n > YEAR_MAX)
    throw new BadRequestException(`year范围应为[${YEAR_MIN},${YEAR_MAX}]`);
  return n;
};

const parseUnitId = (s: string): number => {
  const n = Number(s);
  if (!Number.isFinite(n) || Math.trunc(n) !== n || n <= 0)
    throw new BadRequestException('unitId不正确');
  return n;
};

const normalizeOptionalString = (v: unknown): string | null => {
  if (v == null) return null;
  if (typeof v !== 'string') return String(v);
  const s = v.trim();
  return s.length === 0 ? null : s;
};

const validateStrong = (data: Record<string, unknown>) => {
  const level = normalizeOptionalString((data as any).level);
  if (level != null && !LEVELS.has(level)) {
    throw new BadRequestException('level不正确');
  }

  const fillDate = normalizeOptionalString((data as any).fillDate);
  if (fillDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(fillDate)) {
    throw new BadRequestException('fillDate格式应为YYYY-MM-DD');
  }

  for (const k of numberKeys) {
    const v = (data as any)[k];
    if (v == null || v === '') continue;
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) throw new BadRequestException(`${k}必须为数值`);
    if (n < 0) throw new BadRequestException(`${k}必须为非负数`);
  }
};

const validateWarnings = (data: Record<string, unknown>, warnings: string[]) => {
  const email = normalizeOptionalString((data as any).email);
  if (email != null && !/.+@.+\..+/.test(email)) warnings.push('email 格式可能不正确');
  const phone = normalizeOptionalString((data as any).phone);
  if (phone != null && !/^[0-9\-+() ]{7,20}$/.test(phone))
    warnings.push('phone 格式可能不正确');

  const name = normalizeOptionalString((data as any).name);
  if (!name) warnings.push('缺少 name');
  const address = normalizeOptionalString((data as any).address);
  if (!address) warnings.push('缺少 address');
  const protectedBreedName = normalizeOptionalString((data as any).protectedBreedName);
  if (!protectedBreedName) warnings.push('缺少 protectedBreedName');
};

