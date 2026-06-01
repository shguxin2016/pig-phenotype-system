import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { JwtPayload } from '../auth/auth.types';
import {
  BreedEntity,
  CarcassTraitEntity,
  GrowthTestEntity,
  MeatQualityEntity,
  PigEntity,
  ReproPigletEntity,
  UnitEntity,
} from '../db/entities';

export type CoverageRow = {
  unitId: number;
  unitName: string;
  breedId: number;
  breedName: string;
  registryCount: number;
  growthCount: number;
  reproCount: number;
  carcassCount: number;
  meatqCount: number;
};

export type CoverageResponse = {
  rows: CoverageRow[];
  totals: {
    registryCount: number;
    growthCount: number;
    reproCount: number;
    carcassCount: number;
    meatqCount: number;
  };
};

@Injectable()
export class StatsService {
  constructor(@InjectRepository(PigEntity) private readonly pigs: Repository<PigEntity>) {}

  async coverage(
    user: JwtPayload,
    unitId?: string,
    breedId?: string,
  ): Promise<CoverageResponse> {
    const scoped = this.resolveScope(user, unitId, breedId);

    const qb = this.pigs
      .createQueryBuilder('p')
      .innerJoin(UnitEntity, 'u', 'u.id = p.unitId')
      .innerJoin(BreedEntity, 'b', 'b.id = p.breedId')
      .leftJoin(GrowthTestEntity, 'g', 'g.pigId = p.id')
      .leftJoin(ReproPigletEntity, 'rp', 'rp.pigId = p.id')
      .leftJoin(CarcassTraitEntity, 'c', 'c.pigId = p.id')
      .leftJoin(MeatQualityEntity, 'm', 'm.pigId = p.id')
      .select([
        'p.unitId AS unitId',
        'u.name AS unitName',
        'p.breedId AS breedId',
        'b.name AS breedName',
        'COUNT(p.id) AS registryCount',
        'COUNT(DISTINCT g.pigId) AS growthCount',
        'COUNT(DISTINCT rp.pigId) AS reproCount',
        'COUNT(DISTINCT c.pigId) AS carcassCount',
        'COUNT(DISTINCT m.pigId) AS meatqCount',
      ])
      .groupBy('p.unitId')
      .addGroupBy('u.name')
      .addGroupBy('p.breedId')
      .addGroupBy('b.name')
      .orderBy('p.unitId', 'ASC')
      .addOrderBy('p.breedId', 'ASC');

    if (scoped.unitId != null) qb.andWhere('p.unitId = :unitId', { unitId: scoped.unitId });
    if (scoped.breedId != null) qb.andWhere('p.breedId = :breedId', { breedId: scoped.breedId });

    const raw = await qb.getRawMany();
    const rows: CoverageRow[] = raw.map((r: any) => ({
      unitId: Number(r.unitId),
      unitName: String(r.unitName),
      breedId: Number(r.breedId),
      breedName: String(r.breedName),
      registryCount: Number(r.registryCount ?? 0),
      growthCount: Number(r.growthCount ?? 0),
      reproCount: Number(r.reproCount ?? 0),
      carcassCount: Number(r.carcassCount ?? 0),
      meatqCount: Number(r.meatqCount ?? 0),
    }));

    const totals = rows.reduce(
      (acc, cur) => {
        acc.registryCount += cur.registryCount;
        acc.growthCount += cur.growthCount;
        acc.reproCount += cur.reproCount;
        acc.carcassCount += cur.carcassCount;
        acc.meatqCount += cur.meatqCount;
        return acc;
      },
      {
        registryCount: 0,
        growthCount: 0,
        reproCount: 0,
        carcassCount: 0,
        meatqCount: 0,
      },
    );

    return { rows, totals };
  }

  private resolveScope(
    user: JwtPayload,
    unitId?: string,
    breedId?: string,
  ): { unitId: number | null; breedId: number | null } {
    const parsedUnitId =
      typeof unitId === 'string' && unitId.trim().length > 0
        ? this.parsePositiveInt(unitId, 'unitId')
        : null;
    const parsedBreedId =
      typeof breedId === 'string' && breedId.trim().length > 0
        ? this.parsePositiveInt(breedId, 'breedId')
        : null;

    if (user.role === '保种场') return { unitId: user.unitId, breedId: parsedBreedId };
    if (user.role === '管理单位' || user.role === '测定中心')
      return { unitId: parsedUnitId, breedId: parsedBreedId };
    throw new ForbiddenException('无权限');
  }

  private parsePositiveInt(s: string, name: string): number {
    const n = Number(s);
    if (!Number.isFinite(n) || Math.trunc(n) !== n || n <= 0) {
      throw new BadRequestException(`${name}不正确`);
    }
    return n;
  }
}

