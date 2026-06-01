import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { JwtPayload } from '../auth/auth.types';
import { BreedEntity, PigEntity, UnitEntity } from '../db/entities';

type PigInput = {
  unitId?: number;
  breedId: number;
  individualNo?: string | null;
  earTagNo: string;
  sex: '公' | '母' | '未知';
  birthDate: string;
  birthWeightKg?: number | null;
  damEarTagNo?: string | null;
  remark?: string | null;
};

@Injectable()
export class PigsService {
  constructor(
    @InjectRepository(PigEntity) private readonly pigs: Repository<PigEntity>,
    @InjectRepository(UnitEntity)
    private readonly units: Repository<UnitEntity>,
    @InjectRepository(BreedEntity)
    private readonly breeds: Repository<BreedEntity>,
  ) {}

  async list(
    user: JwtPayload,
    input: { q?: string; limit?: number; offset?: number },
  ) {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const offset = Math.max(input.offset ?? 0, 0);

    const qb = this.pigs
      .createQueryBuilder('p')
      .orderBy('p.id', 'DESC')
      .take(limit)
      .skip(offset);
    this.applyScope(qb, user);

    if (input.q && input.q.trim().length > 0) {
      const q = `%${input.q.trim()}%`;
      qb.andWhere(
        '(p.earTagNo LIKE :q OR p.individualNo LIKE :q OR p.damEarTagNo LIKE :q)',
        { q },
      );
    }

    const [rows, total] = await qb.getManyAndCount();
    return { total, rows };
  }

  async get(user: JwtPayload, pigId: number) {
    const pig = await this.pigs.findOne({ where: { id: pigId } });
    if (!pig) throw new NotFoundException('猪只不存在');
    this.assertCanAccessPig(user, pig);
    return pig;
  }

  async create(user: JwtPayload, input: PigInput) {
    const unitId = this.resolveUnitIdForWrite(user, input.unitId);
    await this.assertUnitExists(unitId);
    await this.assertBreedExists(input.breedId);

    const entity = this.pigs.create({
      unitId,
      breedId: input.breedId,
      individualNo: this.normalizeOptionalString(input.individualNo),
      earTagNo: input.earTagNo.trim(),
      sex: input.sex,
      birthDate: input.birthDate,
      birthWeightKg: input.birthWeightKg ?? null,
      damEarTagNo: this.normalizeOptionalString(input.damEarTagNo),
      remark: this.normalizeOptionalString(input.remark),
    });

    this.validatePig(entity);

    try {
      return await this.pigs.save(entity);
    } catch (e: any) {
      if (String(e?.message ?? '').includes('UNIQUE')) {
        throw new BadRequestException('耳标号或个体号重复');
      }
      throw e;
    }
  }

  async update(user: JwtPayload, pigId: number, input: Partial<PigInput>) {
    const pig = await this.pigs.findOne({ where: { id: pigId } });
    if (!pig) throw new NotFoundException('猪只不存在');
    this.assertCanAccessPig(user, pig);

    if (typeof input.unitId === 'number') {
      if (user.role === '保种场')
        throw new ForbiddenException('无权限修改所属单位');
      await this.assertUnitExists(input.unitId);
      pig.unitId = input.unitId;
    }
    if (typeof input.breedId === 'number') {
      await this.assertBreedExists(input.breedId);
      pig.breedId = input.breedId;
    }
    if (typeof input.individualNo !== 'undefined')
      pig.individualNo = this.normalizeOptionalString(input.individualNo);
    if (typeof input.earTagNo === 'string')
      pig.earTagNo = input.earTagNo.trim();
    if (typeof input.sex === 'string') pig.sex = input.sex;
    if (typeof input.birthDate === 'string') pig.birthDate = input.birthDate;
    if (typeof input.birthWeightKg !== 'undefined')
      pig.birthWeightKg = input.birthWeightKg ?? null;
    if (typeof input.damEarTagNo !== 'undefined')
      pig.damEarTagNo = this.normalizeOptionalString(input.damEarTagNo);
    if (typeof input.remark !== 'undefined')
      pig.remark = this.normalizeOptionalString(input.remark);

    this.validatePig(pig);

    try {
      return await this.pigs.save(pig);
    } catch (e: any) {
      if (String(e?.message ?? '').includes('UNIQUE')) {
        throw new BadRequestException('耳标号或个体号重复');
      }
      throw e;
    }
  }

  async remove(user: JwtPayload, pigId: number) {
    const pig = await this.pigs.findOne({ where: { id: pigId } });
    if (!pig) throw new NotFoundException('猪只不存在');
    this.assertCanAccessPig(user, pig);
    await this.pigs.delete({ id: pigId });
    return { ok: true };
  }

  private applyScope(qb: any, user: JwtPayload) {
    if (user.role === '保种场') {
      qb.andWhere('p.unitId = :unitId', { unitId: user.unitId });
    }
  }

  private assertCanAccessPig(user: JwtPayload, pig: PigEntity) {
    if (user.role === '保种场' && pig.unitId !== user.unitId) {
      throw new ForbiddenException('无权限访问该猪只');
    }
  }

  private resolveUnitIdForWrite(user: JwtPayload, requestedUnitId?: number) {
    if (user.role === '保种场') return user.unitId;
    if (typeof requestedUnitId !== 'number')
      throw new BadRequestException('unitId必填');
    return requestedUnitId;
  }

  private async assertUnitExists(unitId: number) {
    const unit = await this.units.findOne({ where: { id: unitId } });
    if (!unit) throw new BadRequestException('单位不存在');
  }

  private async assertBreedExists(breedId: number) {
    const breed = await this.breeds.findOne({ where: { id: breedId } });
    if (!breed) throw new BadRequestException('品种不存在');
  }

  private validatePig(pig: PigEntity) {
    if (!pig.earTagNo || pig.earTagNo.trim().length === 0)
      throw new BadRequestException('耳标号必填');
    if (!pig.sex || !['公', '母', '未知'].includes(pig.sex))
      throw new BadRequestException('性别不正确');
    if (!pig.birthDate || pig.birthDate.trim().length === 0)
      throw new BadRequestException('出生日期必填');
    if (pig.individualNo && pig.individualNo.trim().length === 0)
      pig.individualNo = null;
  }

  private normalizeOptionalString(v: unknown): string | null {
    if (typeof v !== 'string') return v == null ? null : String(v);
    const s = v.trim();
    return s.length === 0 ? null : s;
  }
}
