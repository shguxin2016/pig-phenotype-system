import { BadRequestException } from '@nestjs/common';
import type { MeatQualityEntity } from '../db/entities';

export type MeatqInput = Partial<{
  sex: string | null;
  colorScore: number | null;
  colorL: number | null;
  colorA: number | null;
  colorB: number | null;
  ph1h: number | null;
  ph24h: number | null;
  dripLossPct: number | null;
  waterHoldingPct: number | null;
  marblingScore: number | null;
  imfPct: number | null;
  impPct: number | null;
  moisturePct: number | null;
  tendernessShearN: number | null;
  cookedMeatRate: number | null;
  remark: string | null;
}>;

export const normalizeMeatqInput = (i: MeatqInput) => {
  const out: any = {};
  for (const [k, v] of Object.entries(i ?? {})) {
    if (typeof v === 'undefined') continue;
    if (typeof v === 'string') out[k] = v.trim().length === 0 ? null : v.trim();
    else out[k] = v;
  }
  return out;
};

const assertFinite = (name: string, v: unknown) => {
  if (typeof v !== 'number' || !Number.isFinite(v))
    throw new BadRequestException(`${name}必须为数值`);
};

const assertRange = (
  name: string,
  v: number,
  min: number,
  max: number,
  leftOpen = false,
) => {
  if ((leftOpen ? v <= min : v < min) || v > max) {
    throw new BadRequestException(
      `${name}范围应为${leftOpen ? '(' : '['}${min},${max}]`,
    );
  }
};

const assertScore = (name: string, v: number) => {
  if (v < 1 || v > 6) throw new BadRequestException(`${name}范围应为[1,6]`);
  const twice = Math.round(v * 2);
  if (Math.abs(v * 2 - twice) > 1e-9)
    throw new BadRequestException(`${name}仅允许0.5分档`);
};

export const validateMeatqStrong = (r: MeatQualityEntity) => {
  if (r.ph1h != null) {
    assertFinite('ph1h', r.ph1h);
    assertRange('ph1h', r.ph1h, 0, 14, true);
  }
  if (r.ph24h != null) {
    assertFinite('ph24h', r.ph24h);
    assertRange('ph24h', r.ph24h, 0, 14, true);
  }

  const pctFields: { key: keyof MeatQualityEntity; name: string }[] = [
    { key: 'dripLossPct', name: 'dripLossPct' },
    { key: 'waterHoldingPct', name: 'waterHoldingPct' },
    { key: 'imfPct', name: 'imfPct' },
    { key: 'impPct', name: 'impPct' },
    { key: 'moisturePct', name: 'moisturePct' },
    { key: 'cookedMeatRate', name: 'cookedMeatRate' },
  ];
  for (const f of pctFields) {
    const v = (r as any)[f.key];
    if (v == null) continue;
    assertFinite(f.name, v);
    assertRange(f.name, v, 0, 100);
  }

  if (r.colorScore != null) {
    assertFinite('colorScore', r.colorScore);
    assertScore('colorScore', r.colorScore);
  }
  if (r.marblingScore != null) {
    assertFinite('marblingScore', r.marblingScore);
    assertScore('marblingScore', r.marblingScore);
  }

  if (r.colorL != null) assertFinite('colorL', r.colorL);
  if (r.colorA != null) assertFinite('colorA', r.colorA);
  if (r.colorB != null) assertFinite('colorB', r.colorB);

  if (r.tendernessShearN != null) {
    assertFinite('tendernessShearN', r.tendernessShearN);
    if (r.tendernessShearN < 0)
      throw new BadRequestException('tendernessShearN必须为非负数');
  }
};

export const computeMeatqWarnings = (r: MeatQualityEntity): string[] => {
  const warnings: string[] = [];

  const L = r.colorL;
  if (L != null) {
    if (L >= 60) warnings.push('肉色：L值≥60，PSE肉（NY/T 821）');
    else if (L >= 53) warnings.push('肉色：L值53~59，趋近PSE肉（NY/T 821）');
    else if (L >= 37) warnings.push('肉色：L值37~52，正常肉色（NY/T 821）');
    else if (L >= 31) warnings.push('肉色：L值31~36，趋近DFD肉（NY/T 821）');
    else warnings.push('肉色：L值≤30，DFD肉（NY/T 821）');
  }

  const ph1 = r.ph1h;
  const ph24 = r.ph24h;
  if (ph1 != null || ph24 != null) {
    if ((ph1 != null && ph1 < 5.9) || (ph24 != null && ph24 < 5.6))
      warnings.push('pH：偏低，PSE肉（NY/T 821）');
    else if ((ph1 != null && ph1 > 6.5) || (ph24 != null && ph24 > 6.0))
      warnings.push('pH：偏高，DFD肉（NY/T 821）');
    else warnings.push('pH：正常范围（NY/T 821）');
  }

  const dl = r.dripLossPct;
  if (dl != null) {
    if (dl > 5.0) warnings.push('滴水损失：>5.0%，PSE肉（NY/T 821）');
    else if (dl < 1.5) warnings.push('滴水损失：<1.5%，DFD肉（NY/T 821）');
    else warnings.push('滴水损失：1.5%~5.0%，正常肉（NY/T 821）');
  }

  const mb = r.marblingScore;
  if (mb != null) {
    const approx =
      mb <= 1
        ? '约1.0%'
        : mb === 2
          ? '约2.0%'
          : mb === 3
            ? '约3.0%'
            : mb === 4
              ? '约4.0%'
              : mb === 5
                ? '约5.0%'
                : '约6.0%以上';
    warnings.push(`大理石纹：${mb}分（肌内脂肪${approx}，NY/T 821）`);
  }

  return warnings;
};

