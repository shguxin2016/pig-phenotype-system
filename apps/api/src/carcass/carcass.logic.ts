import { BadRequestException } from '@nestjs/common';
import type { CarcassTraitEntity } from '../db/entities';

export type CarcassInput = Partial<{
  slaughterDate: string | null;
  sex: string | null;
  preSlaughterWeightKg: number | null;
  carcassWeightLeftKg: number | null;
  carcassWeightRightKg: number | null;
  carcassLengthCm: number | null;
  bodyObliqueLengthCm: number | null;
  backfatShoulderMm: number | null;
  backfatLastRibMm: number | null;
  backfatLumbarMm: number | null;
  skinThickness6_7RibMm: number | null;
  emaLastRibCm2: number | null;
  emaHeightCm: number | null;
  emaWidthCm: number | null;
  leftDetachSkinKg: number | null;
  leftDetachBoneKg: number | null;
  leftDetachFatKg: number | null;
  leftDetachLeanKg: number | null;
  ribCount: number | null;
  hoofWeightKg: number | null;
  headWeightKg: number | null;
  leftLegWeightKg: number | null;
  remark: string | null;
}>;

export const normalizeCarcassInput = (i: CarcassInput) => {
  const out: any = {};
  for (const [k, v] of Object.entries(i ?? {})) {
    if (typeof v === 'undefined') continue;
    if (typeof v === 'string') out[k] = v.trim().length === 0 ? null : v.trim();
    else out[k] = v;
  }
  return out;
};

export const validateCarcassBasic = (r: CarcassTraitEntity) => {
  if (r.slaughterDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(r.slaughterDate)) {
    throw new BadRequestException('屠宰日期格式应为YYYY-MM-DD');
  }

  const nonNeg: (keyof CarcassTraitEntity)[] = [
    'preSlaughterWeightKg',
    'carcassWeightLeftKg',
    'carcassWeightRightKg',
    'carcassLengthCm',
    'bodyObliqueLengthCm',
    'backfatShoulderMm',
    'backfatLastRibMm',
    'backfatLumbarMm',
    'skinThickness6_7RibMm',
    'emaLastRibCm2',
    'emaHeightCm',
    'emaWidthCm',
    'leftDetachSkinKg',
    'leftDetachBoneKg',
    'leftDetachFatKg',
    'leftDetachLeanKg',
    'hoofWeightKg',
    'headWeightKg',
    'leftLegWeightKg',
  ];

  for (const f of nonNeg) {
    const v = (r as any)[f];
    if (v == null) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      throw new BadRequestException(`${String(f)}必须为非负数`);
    }
  }

  if (r.ribCount != null) {
    if (
      !Number.isFinite(r.ribCount) ||
      Math.trunc(r.ribCount) !== r.ribCount ||
      r.ribCount < 0
    ) {
      throw new BadRequestException('ribCount必须为非负整数');
    }
  }
};

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

export const computeCarcassDerived = (
  r: CarcassTraitEntity,
): { warnings: string[] } => {
  const warnings: string[] = [];

  const leftSkin = r.leftDetachSkinKg;
  const leftBone = r.leftDetachBoneKg;
  const leftFat = r.leftDetachFatKg;
  const leftLean = r.leftDetachLeanKg;
  const leftCarcass = r.carcassWeightLeftKg;
  const rightCarcass = r.carcassWeightRightKg;
  const pre = r.preSlaughterWeightKg;

  const leftDetachTotal =
    leftSkin != null && leftBone != null && leftFat != null && leftLean != null
      ? leftSkin + leftBone + leftFat + leftLean
      : null;

  if (leftDetachTotal != null && leftDetachTotal > 0) {
    r.skinRatePct = round((leftSkin! / leftDetachTotal) * 100, 3);
    r.boneRatePct = round((leftBone! / leftDetachTotal) * 100, 3);
    r.fatRatePct = round((leftFat! / leftDetachTotal) * 100, 3);
    r.leanRatePct = round((leftLean! / leftDetachTotal) * 100, 3);
  } else {
    r.skinRatePct = null;
    r.boneRatePct = null;
    r.fatRatePct = null;
    r.leanRatePct = null;
  }

  if (leftCarcass != null && leftCarcass > 0 && r.leftLegWeightKg != null) {
    r.legHipRatioPct = round((r.leftLegWeightKg / leftCarcass) * 100, 3);
  } else {
    r.legHipRatioPct = null;
  }

  if (pre != null && pre > 0 && leftCarcass != null && rightCarcass != null) {
    r.slaughterRatePct = round(((leftCarcass + rightCarcass) / pre) * 100, 3);
  } else {
    r.slaughterRatePct = null;
  }

  if (leftCarcass != null && leftCarcass > 0 && leftDetachTotal != null) {
    r.detachLossPct = round(
      ((leftCarcass - leftDetachTotal) / leftCarcass) * 100,
      3,
    );
    if (r.detachLossPct > 2)
      warnings.push('分割损耗超过2%（NY/T 825 建议不高于2%）');
  } else {
    r.detachLossPct = null;
  }

  return { warnings };
};

export const validateCarcassLogical = (r: CarcassTraitEntity) => {
  const leftSkin = r.leftDetachSkinKg;
  const leftBone = r.leftDetachBoneKg;
  const leftFat = r.leftDetachFatKg;
  const leftLean = r.leftDetachLeanKg;
  const leftCarcass = r.carcassWeightLeftKg;
  const rightCarcass = r.carcassWeightRightKg;
  const pre = r.preSlaughterWeightKg;

  const leftDetachTotal =
    leftSkin != null && leftBone != null && leftFat != null && leftLean != null
      ? leftSkin + leftBone + leftFat + leftLean
      : null;

  if (
    leftDetachTotal != null &&
    leftCarcass != null &&
    leftDetachTotal > leftCarcass
  ) {
    throw new BadRequestException('左分割总重不能大于左胴体重');
  }

  if (r.slaughterRatePct != null) {
    if (
      pre == null ||
      pre <= 0 ||
      leftCarcass == null ||
      rightCarcass == null
    ) {
      throw new BadRequestException('屠宰率计算依赖字段不完整');
    }
    if (r.slaughterRatePct <= 0 || r.slaughterRatePct > 100)
      throw new BadRequestException('屠宰率不在合理范围(0,100]');
  }

  if (r.legHipRatioPct != null) {
    if (leftCarcass == null || leftCarcass <= 0 || r.leftLegWeightKg == null) {
      throw new BadRequestException('腿臀比计算依赖字段不完整');
    }
    if (r.legHipRatioPct <= 0 || r.legHipRatioPct > 100)
      throw new BadRequestException('腿臀比不在合理范围(0,100]');
  }

  const rates = [
    r.skinRatePct,
    r.boneRatePct,
    r.fatRatePct,
    r.leanRatePct,
  ].filter((x) => x != null) as number[];
  for (const v of rates) {
    if (v < 0 || v > 100)
      throw new BadRequestException('皮/骨/肥/瘦率不在合理范围[0,100]');
  }
};

