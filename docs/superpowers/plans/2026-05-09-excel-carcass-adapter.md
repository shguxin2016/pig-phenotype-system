# Excel Import/Export — Milestone 4 (carcass) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Excel 基座（已完成 pigs + growth + repro）上补齐 carcass（胴体性状）模块的模板下载、导出、导入预校验、确认写入、错误明细下载，并新增 e2e 验证。

**Architecture:** 延续当前 `ExcelService` 分支式实现；为避免 NY/T 825-2004 的复算/校验口径漂移，将 `carcass.service.ts` 中的 normalize/validate/compute 提取到 `carcass.logic.ts`，由 CarcassService 与 ExcelService 共同复用。导入采取 validate/commit 两阶段，commit 事务内批量写入 `carcass_trait`（每猪单条，已存在则报错不写）。

**Tech Stack:** NestJS + TypeORM + exceljs + jest/supertest e2e。

---

## Locked Decisions

- 模板不包含 `sex` 列（导出可带，用于查看）
- 冲突策略：`carcass_trait` 已存在（pigId 唯一）则 **validate 报错不写**
- 导入仅写“基础测量/分割”字段；派生字段（屠宰率/腿臀比/皮骨肥瘦率/分割损耗）由服务端复算并存库（与当前 CarcassService 一致）

---

## File Map

**Backend**
- Add: [carcass.logic.ts](file:///workspace/apps/api/src/carcass/carcass.logic.ts)
- Modify: [carcass.service.ts](file:///workspace/apps/api/src/carcass/carcass.service.ts)
- Modify: [excel.module.ts](file:///workspace/apps/api/src/excel/excel.module.ts)
- Modify: [excel.service.ts](file:///workspace/apps/api/src/excel/excel.service.ts)
- Add: [excel-carcass-import.e2e-spec.ts](file:///workspace/apps/api/test/excel-carcass-import.e2e-spec.ts)

---

## Task 1: Extract carcass compute/validate into carcass.logic.ts

**Files:**
- Add: [carcass.logic.ts](file:///workspace/apps/api/src/carcass/carcass.logic.ts)
- Modify: [carcass.service.ts](file:///workspace/apps/api/src/carcass/carcass.service.ts)

- [ ] **Step 1: Create carcass.logic.ts**

Create `apps/api/src/carcass/carcass.logic.ts` exporting:

```ts
import { BadRequestException } from '@nestjs/common'
import type { CarcassTraitEntity } from '../db/entities'

export type CarcassInput = Partial<{
  slaughterDate: string | null
  sex: string | null
  preSlaughterWeightKg: number | null
  carcassWeightLeftKg: number | null
  carcassWeightRightKg: number | null
  carcassLengthCm: number | null
  bodyObliqueLengthCm: number | null
  backfatShoulderMm: number | null
  backfatLastRibMm: number | null
  backfatLumbarMm: number | null
  skinThickness6_7RibMm: number | null
  emaLastRibCm2: number | null
  emaHeightCm: number | null
  emaWidthCm: number | null
  leftDetachSkinKg: number | null
  leftDetachBoneKg: number | null
  leftDetachFatKg: number | null
  leftDetachLeanKg: number | null
  ribCount: number | null
  hoofWeightKg: number | null
  headWeightKg: number | null
  leftLegWeightKg: number | null
  remark: string | null
}>

export const normalizeCarcassInput = (i: CarcassInput) => {
  const out: any = {}
  for (const [k, v] of Object.entries(i ?? {})) {
    if (typeof v === 'undefined') continue
    if (typeof v === 'string') out[k] = v.trim().length === 0 ? null : v.trim()
    else out[k] = v
  }
  return out
}

export const validateCarcassBasic = (r: CarcassTraitEntity) => {
  if (r.slaughterDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(r.slaughterDate)) {
    throw new BadRequestException('屠宰日期格式应为YYYY-MM-DD')
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
  ]
  for (const f of nonNeg) {
    const v = (r as any)[f]
    if (v == null) continue
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      throw new BadRequestException(`${String(f)}必须为非负数`)
    }
  }
  if (r.ribCount != null) {
    if (!Number.isFinite(r.ribCount) || Math.trunc(r.ribCount) !== r.ribCount || r.ribCount < 0) {
      throw new BadRequestException('ribCount必须为非负整数')
    }
  }
}

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp

export const computeCarcassDerived = (r: CarcassTraitEntity): { warnings: string[] } => {
  const warnings: string[] = []
  const leftSkin = r.leftDetachSkinKg
  const leftBone = r.leftDetachBoneKg
  const leftFat = r.leftDetachFatKg
  const leftLean = r.leftDetachLeanKg
  const leftCarcass = r.carcassWeightLeftKg
  const rightCarcass = r.carcassWeightRightKg
  const pre = r.preSlaughterWeightKg

  const leftDetachTotal =
    leftSkin != null && leftBone != null && leftFat != null && leftLean != null
      ? leftSkin + leftBone + leftFat + leftLean
      : null

  if (leftDetachTotal != null && leftDetachTotal > 0) {
    r.skinRatePct = round((leftSkin! / leftDetachTotal) * 100, 3)
    r.boneRatePct = round((leftBone! / leftDetachTotal) * 100, 3)
    r.fatRatePct = round((leftFat! / leftDetachTotal) * 100, 3)
    r.leanRatePct = round((leftLean! / leftDetachTotal) * 100, 3)
  } else {
    r.skinRatePct = null
    r.boneRatePct = null
    r.fatRatePct = null
    r.leanRatePct = null
  }

  if (leftCarcass != null && leftCarcass > 0 && r.leftLegWeightKg != null) {
    r.legHipRatioPct = round((r.leftLegWeightKg / leftCarcass) * 100, 3)
  } else {
    r.legHipRatioPct = null
  }

  if (pre != null && pre > 0 && leftCarcass != null && rightCarcass != null) {
    r.slaughterRatePct = round(((leftCarcass + rightCarcass) / pre) * 100, 3)
  } else {
    r.slaughterRatePct = null
  }

  if (leftCarcass != null && leftCarcass > 0 && leftDetachTotal != null) {
    r.detachLossPct = round(((leftCarcass - leftDetachTotal) / leftCarcass) * 100, 3)
    if (r.detachLossPct > 2) warnings.push('分割损耗超过2%（NY/T 825 建议不高于2%）')
  } else {
    r.detachLossPct = null
  }

  return { warnings }
}

export const validateCarcassLogical = (r: CarcassTraitEntity) => {
  const leftSkin = r.leftDetachSkinKg
  const leftBone = r.leftDetachBoneKg
  const leftFat = r.leftDetachFatKg
  const leftLean = r.leftDetachLeanKg
  const leftCarcass = r.carcassWeightLeftKg
  const rightCarcass = r.carcassWeightRightKg
  const pre = r.preSlaughterWeightKg

  const leftDetachTotal =
    leftSkin != null && leftBone != null && leftFat != null && leftLean != null
      ? leftSkin + leftBone + leftFat + leftLean
      : null

  if (leftDetachTotal != null && leftCarcass != null && leftDetachTotal > leftCarcass) {
    throw new BadRequestException('左分割总重不能大于左胴体重')
  }

  if (r.slaughterRatePct != null) {
    if (pre == null || pre <= 0 || leftCarcass == null || rightCarcass == null) {
      throw new BadRequestException('屠宰率计算依赖字段不完整')
    }
    if (r.slaughterRatePct <= 0 || r.slaughterRatePct > 100) {
      throw new BadRequestException('屠宰率不在合理范围(0,100]')
    }
  }

  if (r.legHipRatioPct != null) {
    if (leftCarcass == null || leftCarcass <= 0 || r.leftLegWeightKg == null) {
      throw new BadRequestException('腿臀比计算依赖字段不完整')
    }
    if (r.legHipRatioPct <= 0 || r.legHipRatioPct > 100) {
      throw new BadRequestException('腿臀比不在合理范围(0,100]')
    }
  }

  const rates = [r.skinRatePct, r.boneRatePct, r.fatRatePct, r.leanRatePct].filter((x) => x != null) as number[]
  for (const v of rates) {
    if (v < 0 || v > 100) throw new BadRequestException('皮/骨/肥/瘦率不在合理范围[0,100]')
  }
}
```

- [ ] **Step 2: Update carcass.service.ts to use logic module**

In `apps/api/src/carcass/carcass.service.ts`:
- remove the local `normalizeInput/validateBasic/computeDerived/validateLogical`
- import from `./carcass.logic`

Expected shape:

```ts
import { computeCarcassDerived, normalizeCarcassInput, validateCarcassBasic, validateCarcassLogical } from './carcass.logic'
// ...
Object.assign(record, normalizeCarcassInput(input))
validateCarcassBasic(record)
const { warnings } = computeCarcassDerived(record)
validateCarcassLogical(record)
```

- [ ] **Step 3: Run api tests/build**

Run:

```bash
cd /workspace/apps/api
npm test -- --runInBand
npm run build
```

Expected: PASS

---

## Task 2: Excel wiring for carcass (module + repositories)

**Files:**
- Modify: [excel.module.ts](file:///workspace/apps/api/src/excel/excel.module.ts)
- Modify: [excel.service.ts](file:///workspace/apps/api/src/excel/excel.service.ts)

- [ ] **Step 1: ExcelModule 注入 CarcassTraitEntity**

Add to `TypeOrmModule.forFeature([...])`:

```ts
import { CarcassTraitEntity } from '../db/entities'
// ...
CarcassTraitEntity,
```

- [ ] **Step 2: ExcelService 注入 carcass repo**

Add:

```ts
@InjectRepository(CarcassTraitEntity)
private readonly carcass: Repository<CarcassTraitEntity>,
```

- [ ] **Step 3: 扩展 assertModule 与入口分支**

Add module `'carcass'` and route branches for template/export/validate/commit.

---

## Task 3: Implement carcass template + export

**Files:**
- Modify: [excel.service.ts](file:///workspace/apps/api/src/excel/excel.service.ts)

- [ ] **Step 1: generateCarcassTemplate()**

Header columns (no sex, no derived):

```ts
[
  '耳标号 ear_tag_no',
  '屠宰日期 slaughter_date',
  '宰前活重 pre_slaughter_weight_kg',
  '左胴体重 carcass_weight_left_kg',
  '右胴体重 carcass_weight_right_kg',
  '肋骨数 rib_count',
  '胴体长 carcass_length_cm',
  '体斜长 body_oblique_length_cm',
  '背膘(肩) backfat_shoulder_mm',
  '背膘(最后肋) backfat_last_rib_mm',
  '背膘(腰荐) backfat_lumbar_mm',
  '皮厚(6~7肋) skin_thickness_6_7_rib_mm',
  '眼肌面积 ema_last_rib_cm2',
  '眼肌高 ema_height_cm',
  '眼肌宽 ema_width_cm',
  '皮重(kg) left_detach_skin_kg',
  '骨重(kg) left_detach_bone_kg',
  '肥肉重(kg) left_detach_fat_kg',
  '瘦肉重(kg) left_detach_lean_kg',
  '左腿臀重(kg) left_leg_weight_kg',
  '蹄重(kg) hoof_weight_kg',
  '头重(kg) head_weight_kg',
  '备注 remark',
]
```

- [ ] **Step 2: exportCarcass()**

Query by unit scope:
- join `CarcassTraitEntity c` with `PigEntity p` to filter `p.unitId = resolvedUnitId`
- export base columns + derived columns:
  - `detach_loss_pct, leg_hip_ratio_pct, skin_rate_pct, bone_rate_pct, fat_rate_pct, lean_rate_pct, slaughter_rate_pct`

---

## Task 4: Implement carcass validate + commit

**Files:**
- Modify: [excel.service.ts](file:///workspace/apps/api/src/excel/excel.service.ts)

- [ ] **Step 1: validateCarcass()**

Rules:
- `unitId` param required
- `ear_tag_no` required, file-unique
- pig must exist and belong to unit
- carcass record must NOT exist (unique pigId)
- parse dates/numbers/ints using existing helpers (`parseDateOrNull/parseNumberCell/parseIntCell`)
- build `CarcassTraitEntity` in-memory:
  - assign pigId + normalized fields
  - `validateCarcassBasic(entity)`
  - `computeCarcassDerived(entity)` (collect warnings with row prefix)
  - `validateCarcassLogical(entity)`
- payloadJson store `{ rows: CarcassPayloadRow[] }` where each row contains pigId + all entity fields that should be inserted (including derived)

- [ ] **Step 2: commitCarcass()**

Rules:
- batch.status validated only
- errorCount==0 required
- transaction insert `carcass_trait` rows in chunks (like pigs/growth)
- set batch.status committed, on failure set failed

---

## Task 5: Add carcass e2e

**Files:**
- Add: [excel-carcass-import.e2e-spec.ts](file:///workspace/apps/api/test/excel-carcass-import.e2e-spec.ts)

- [ ] **Step 1: e2e flow**

Test should:
- import pigs via existing pigs Excel
- build carcass xlsx (one row) and validate+commit
- query pigId via `/pigs?q=...`
- GET `/pigs/:pigId/carcass` and assert:
  - record exists
  - `slaughterRatePct/legHipRatioPct/skinRatePct...` are computed when inputs sufficient

- [ ] **Step 2: Run e2e**

Run:

```bash
cd /workspace/apps/api
npm run test:e2e -- --runInBand
```

Expected: PASS

---

## Task 6: Full verification

- [ ] **Step 1: api**

```bash
cd /workspace/apps/api
npm test -- --runInBand
npm run build
npm run test:e2e -- --runInBand
```

- [ ] **Step 2: web**

```bash
cd /workspace/apps/web
npm run build
```

