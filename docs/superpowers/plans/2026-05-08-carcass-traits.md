# Carcass Traits (NY/T 825-2004) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为每头测定猪只提供胴体性状录入、校验与 NY/T 825-2004 指标自动计算，并在前端提供单页分组录入页。

**Architecture:** 后端新增 `CarcassService` 对 `CarcassTraitEntity` 做按 pigId 的 upsert，并在保存前执行口径统一的自动计算与逻辑校验；前端新增 `/pigs/[pigId]/carcass` 单页分组表单，保存后展示只读计算结果与告警。

**Tech Stack:** NestJS + TypeORM；Next.js App Router；Jest + supertest。

---

## File Map

**Backend (NestJS)**
- Create: `/workspace/apps/api/src/carcass/carcass.service.ts`
- Create: `/workspace/apps/api/src/carcass/carcass.controller.ts`
- Create: `/workspace/apps/api/src/carcass/carcass.module.ts`
- Modify: `/workspace/apps/api/src/app.module.ts`
- Test: `/workspace/apps/api/src/carcass/carcass.controller.spec.ts`

**Frontend (Next.js)**
- Modify: `/workspace/apps/web/src/app/pigs/[pigId]/page.tsx`
- Create: `/workspace/apps/web/src/app/pigs/[pigId]/carcass/page.tsx`

---

## Task 1: Backend — Carcass module skeleton

**Files:**
- Create: `/workspace/apps/api/src/carcass/carcass.module.ts`
- Create: `/workspace/apps/api/src/carcass/carcass.controller.ts`
- Create: `/workspace/apps/api/src/carcass/carcass.service.ts`
- Modify: `/workspace/apps/api/src/app.module.ts`

- [ ] **Step 1: Add module wiring**

Create `/workspace/apps/api/src/carcass/carcass.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CarcassTraitEntity, PigEntity } from '../db/entities'
import { CarcassController } from './carcass.controller'
import { CarcassService } from './carcass.service'

@Module({
  imports: [TypeOrmModule.forFeature([CarcassTraitEntity, PigEntity])],
  controllers: [CarcassController],
  providers: [CarcassService]
})
export class CarcassModule {}
```

- [ ] **Step 2: Register module**

Modify `/workspace/apps/api/src/app.module.ts` to include `CarcassModule` in imports.

- [ ] **Step 3: Add controller routes**

Create `/workspace/apps/api/src/carcass/carcass.controller.ts`:

```ts
import { Body, Controller, Get, Param, ParseIntPipe, Put, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import type { JwtPayload } from '../auth/auth.types'
import { CarcassService } from './carcass.service'

@UseGuards(JwtAuthGuard)
@Controller('pigs/:pigId/carcass')
export class CarcassController {
  constructor(private readonly carcass: CarcassService) {}

  @Get()
  async get(@Req() req: { user: JwtPayload }, @Param('pigId', ParseIntPipe) pigId: number) {
    return this.carcass.get(req.user, pigId)
  }

  @Put()
  async upsert(@Req() req: { user: JwtPayload }, @Param('pigId', ParseIntPipe) pigId: number, @Body() body: any) {
    return this.carcass.upsert(req.user, pigId, body)
  }
}
```

- [ ] **Step 4: Decide response shape**

Standardize response to:

```ts
type CarcassUpsertResponse = { record: CarcassTraitEntity; warnings: string[] }
type CarcassGetResponse = CarcassUpsertResponse | null
```

So the frontend can show `warnings` (e.g., 分割损耗 > 2%).

- [ ] **Step 5: Run build**

Run:

```bash
cd /workspace/apps/api
npm run build
```

Expected: PASS

---

## Task 2: Backend — Calculations & validations (NY/T 825-2004)

**Files:**
- Modify: `/workspace/apps/api/src/carcass/carcass.service.ts`
- Test: `/workspace/apps/api/src/carcass/carcass.controller.spec.ts`

- [ ] **Step 1: Implement service skeleton**

Create `/workspace/apps/api/src/carcass/carcass.service.ts`:

```ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { JwtPayload } from '../auth/auth.types'
import { CarcassTraitEntity, PigEntity } from '../db/entities'

type CarcassInput = Partial<{
  slaughterDate: string | null
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

export type CarcassResponse = { record: CarcassTraitEntity; warnings: string[] }

@Injectable()
export class CarcassService {
  constructor(
    @InjectRepository(CarcassTraitEntity) private readonly carcass: Repository<CarcassTraitEntity>,
    @InjectRepository(PigEntity) private readonly pigs: Repository<PigEntity>
  ) {}

  async get(user: JwtPayload, pigId: number): Promise<CarcassResponse | null> {
    await this.requirePig(user, pigId)
    const record = await this.carcass.findOne({ where: { pigId } })
    if (!record) return null
    const { warnings } = computeDerived(record)
    return { record, warnings }
  }

  async upsert(user: JwtPayload, pigId: number, input: CarcassInput): Promise<CarcassResponse> {
    await this.requirePig(user, pigId)

    const record =
      (await this.carcass.findOne({ where: { pigId } })) ??
      this.carcass.create({
        pigId
      })

    Object.assign(record, normalizeInput(input))
    validateBasic(record)

    const { warnings } = computeDerived(record)
    validateLogical(record)

    const saved = await this.carcass.save(record)
    return { record: saved, warnings }
  }

  private async requirePig(user: JwtPayload, pigId: number) {
    const pig = await this.pigs.findOne({ where: { id: pigId } })
    if (!pig) throw new NotFoundException('猪只不存在')
    if (user.role === '保种场' && pig.unitId !== user.unitId) throw new ForbiddenException('无权限访问该猪只')
    return pig
  }
}

const normalizeInput = (i: CarcassInput) => {
  const out: any = {}
  for (const [k, v] of Object.entries(i ?? {})) {
    if (typeof v === 'undefined') continue
    if (typeof v === 'string') out[k] = v.trim().length === 0 ? null : v.trim()
    else out[k] = v
  }
  return out
}

const validateBasic = (r: CarcassTraitEntity) => {
  const date = r.slaughterDate
  if (date != null && !/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) throw new BadRequestException('屠宰日期格式应为YYYY-MM-DD')
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
    'leftLegWeightKg'
  ]
  for (const f of nonNeg) {
    const v = r[f] as any
    if (v == null) continue
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new BadRequestException(`${String(f)}必须为非负数`)
  }
  if (r.ribCount != null) {
    if (!Number.isFinite(r.ribCount) || Math.trunc(r.ribCount) !== r.ribCount || r.ribCount < 0) {
      throw new BadRequestException('ribCount必须为非负整数')
    }
  }
}

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp

const computeDerived = (r: CarcassTraitEntity): { warnings: string[] } => {
  const warnings: string[] = []

  const leftSkin = r.leftDetachSkinKg
  const leftBone = r.leftDetachBoneKg
  const leftFat = r.leftDetachFatKg
  const leftLean = r.leftDetachLeanKg
  const leftCarcass = r.carcassWeightLeftKg
  const rightCarcass = r.carcassWeightRightKg
  const pre = r.preSlaughterWeightKg

  const leftDetachTotal =
    leftSkin != null && leftBone != null && leftFat != null && leftLean != null ? leftSkin + leftBone + leftFat + leftLean : null

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

const validateLogical = (r: CarcassTraitEntity) => {
  const leftSkin = r.leftDetachSkinKg
  const leftBone = r.leftDetachBoneKg
  const leftFat = r.leftDetachFatKg
  const leftLean = r.leftDetachLeanKg
  const leftCarcass = r.carcassWeightLeftKg
  const rightCarcass = r.carcassWeightRightKg
  const pre = r.preSlaughterWeightKg

  const leftDetachTotal =
    leftSkin != null && leftBone != null && leftFat != null && leftLean != null ? leftSkin + leftBone + leftFat + leftLean : null

  if (leftDetachTotal != null && leftCarcass != null && leftDetachTotal > leftCarcass) {
    throw new BadRequestException('左分割总重不能大于左胴体重')
  }

  if (r.slaughterRatePct != null) {
    if (pre == null || pre <= 0 || leftCarcass == null || rightCarcass == null) throw new BadRequestException('屠宰率计算依赖字段不完整')
    if (r.slaughterRatePct <= 0 || r.slaughterRatePct > 100) throw new BadRequestException('屠宰率不在合理范围(0,100]')
  }

  if (r.legHipRatioPct != null) {
    if (leftCarcass == null || leftCarcass <= 0 || r.leftLegWeightKg == null) throw new BadRequestException('腿臀比计算依赖字段不完整')
    if (r.legHipRatioPct <= 0 || r.legHipRatioPct > 100) throw new BadRequestException('腿臀比不在合理范围(0,100]')
  }

  const rates = [r.skinRatePct, r.boneRatePct, r.fatRatePct, r.leanRatePct].filter((x) => x != null) as number[]
  for (const v of rates) {
    if (v < 0 || v > 100) throw new BadRequestException('皮/骨/肥/瘦率不在合理范围[0,100]')
  }
}
```

- [ ] **Step 2: Add controller test (failing first)**

Create `/workspace/apps/api/src/carcass/carcass.controller.spec.ts` with a failing assertion stub:

```ts
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../app.module'

describe('CarcassController', () => {
  let app: INestApplication

  const startApp = async () => {
    process.env.DB_TYPE = 'sqljs'
    process.env.DB_SQLJS_PATH = `data/test-${Date.now()}-${Math.random()}.sqlite`
    process.env.ADMIN_USERNAME = 'admin'
    process.env.ADMIN_INIT_PASSWORD = 'test-password'
    process.env.JWT_SECRET = 'test-secret'

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  }

  afterEach(async () => {
    if (app) await app.close()
  })

  const loginAdmin = async () => {
    const res = await request(app.getHttpServer()).post('/auth/login').send({
      username: 'admin',
      unitName: '上海市动物疫病预防控制中心',
      password: 'test-password'
    })
    expect(res.status).toBe(201)
    return res.body.accessToken as string
  }

  it('computes NYT825 derived metrics', async () => {
    await startApp()
    const token = await loginAdmin()

    const pigRes = await request(app.getHttpServer())
      .post('/pigs')
      .set('Authorization', `Bearer ${token}`)
      .send({ unitId: 1, breedId: 1, individualNo: 'C1', earTagNo: 'C-E001', sex: '母', birthDate: '2026-01-01' })
    expect(pigRes.status).toBe(201)
    const pigId = pigRes.body.id

    const up = await request(app.getHttpServer())
      .put(`/pigs/${pigId}/carcass`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        slaughterDate: '2026-06-01',
        preSlaughterWeightKg: 100,
        carcassWeightLeftKg: 38,
        carcassWeightRightKg: 38,
        leftDetachSkinKg: 4,
        leftDetachBoneKg: 5,
        leftDetachFatKg: 6,
        leftDetachLeanKg: 20,
        leftLegWeightKg: 9
      })
    expect(up.status).toBe(200)

    expect(up.body.record.slaughterRatePct).toBeCloseTo(76, 3)
    expect(up.body.record.legHipRatioPct).toBeCloseTo((9 / 38) * 100, 3)
    expect(up.body.record.skinRatePct).toBeCloseTo((4 / 35) * 100, 3)
    expect(up.body.record.boneRatePct).toBeCloseTo((5 / 35) * 100, 3)
    expect(up.body.record.fatRatePct).toBeCloseTo((6 / 35) * 100, 3)
    expect(up.body.record.leanRatePct).toBeCloseTo((20 / 35) * 100, 3)
    expect(up.body.record.detachLossPct).toBeCloseTo(((38 - 35) / 38) * 100, 3)
    expect(up.body.warnings.length).toBe(1)
  })
})
```

- [ ] **Step 3: Run tests**

Run:

```bash
cd /workspace/apps/api
npm test -- --runInBand
```

Expected: PASS

- [ ] **Step 4: Run build**

Run:

```bash
cd /workspace/apps/api
npm run build
```

Expected: PASS

---

## Task 3: Frontend — Carcass single-page form (A 单页分组)

**Files:**
- Modify: `/workspace/apps/web/src/app/pigs/[pigId]/page.tsx`
- Create: `/workspace/apps/web/src/app/pigs/[pigId]/carcass/page.tsx`

- [ ] **Step 1: Add entry link from pig detail**

Modify `/workspace/apps/web/src/app/pigs/[pigId]/page.tsx` to add:

```tsx
<Link className="text-blue-600 hover:underline" href={`/pigs/${pigId}/carcass`}>
  胴体性状
</Link>
```

- [ ] **Step 2: Implement `/pigs/[pigId]/carcass` page**

Create `/workspace/apps/web/src/app/pigs/[pigId]/carcass/page.tsx`:

- Load pig info: `GET /pigs/:pigId`
- Load carcass: `GET /pigs/:pigId/carcass` (expect `null` or `{record,warnings}`)
- Form sections: 基础 / 测量 / 分割（左） / 自动计算（只读）
- Save: `PUT /pigs/:pigId/carcass`
- If response `warnings.length > 0`, show as amber tip box
- 401 => clear token and redirect `/login`

Implementation template (structure):

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { clearToken } from "@/lib/auth";

type Pig = { id: number; earTagNo: string; individualNo: string | null; birthDate: string; sex: string };
type CarcassRecord = any;
type CarcassResp = { record: CarcassRecord; warnings: string[] } | null;

const toNum = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export default function CarcassPage() {
  const router = useRouter();
  const params = useParams<{ pigId: string }>();
  const pigId = Number(params.pigId);

  const [pig, setPig] = useState<Pig | null>(null);
  const [resp, setResp] = useState<CarcassResp>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    slaughterDate: "",
    preSlaughterWeightKg: "",
    carcassWeightLeftKg: "",
    carcassWeightRightKg: "",
    carcassLengthCm: "",
    bodyObliqueLengthCm: "",
    backfatShoulderMm: "",
    backfatLastRibMm: "",
    backfatLumbarMm: "",
    skinThickness6_7RibMm: "",
    emaLastRibCm2: "",
    emaHeightCm: "",
    emaWidthCm: "",
    leftDetachSkinKg: "",
    leftDetachBoneKg: "",
    leftDetachFatKg: "",
    leftDetachLeanKg: "",
    leftLegWeightKg: "",
    hoofWeightKg: "",
    headWeightKg: "",
    ribCount: ""
  });

  const reload = async () => {
    setError(null);
    try {
      const p = await apiFetch<Pig>(`/pigs/${pigId}`);
      setPig(p);
      const r = await apiFetch<CarcassResp>(`/pigs/${pigId}/carcass`);
      setResp(r);
      setWarnings(r?.warnings ?? []);
      const rec = r?.record;
      setForm((prev) => ({
        ...prev,
        slaughterDate: rec?.slaughterDate ?? "",
        preSlaughterWeightKg: rec?.preSlaughterWeightKg == null ? "" : String(rec.preSlaughterWeightKg),
        carcassWeightLeftKg: rec?.carcassWeightLeftKg == null ? "" : String(rec.carcassWeightLeftKg),
        carcassWeightRightKg: rec?.carcassWeightRightKg == null ? "" : String(rec.carcassWeightRightKg),
        carcassLengthCm: rec?.carcassLengthCm == null ? "" : String(rec.carcassLengthCm),
        bodyObliqueLengthCm: rec?.bodyObliqueLengthCm == null ? "" : String(rec.bodyObliqueLengthCm),
        backfatShoulderMm: rec?.backfatShoulderMm == null ? "" : String(rec.backfatShoulderMm),
        backfatLastRibMm: rec?.backfatLastRibMm == null ? "" : String(rec.backfatLastRibMm),
        backfatLumbarMm: rec?.backfatLumbarMm == null ? "" : String(rec.backfatLumbarMm),
        skinThickness6_7RibMm: rec?.skinThickness6_7RibMm == null ? "" : String(rec.skinThickness6_7RibMm),
        emaLastRibCm2: rec?.emaLastRibCm2 == null ? "" : String(rec.emaLastRibCm2),
        emaHeightCm: rec?.emaHeightCm == null ? "" : String(rec.emaHeightCm),
        emaWidthCm: rec?.emaWidthCm == null ? "" : String(rec.emaWidthCm),
        leftDetachSkinKg: rec?.leftDetachSkinKg == null ? "" : String(rec.leftDetachSkinKg),
        leftDetachBoneKg: rec?.leftDetachBoneKg == null ? "" : String(rec.leftDetachBoneKg),
        leftDetachFatKg: rec?.leftDetachFatKg == null ? "" : String(rec.leftDetachFatKg),
        leftDetachLeanKg: rec?.leftDetachLeanKg == null ? "" : String(rec.leftDetachLeanKg),
        leftLegWeightKg: rec?.leftLegWeightKg == null ? "" : String(rec.leftLegWeightKg),
        hoofWeightKg: rec?.hoofWeightKg == null ? "" : String(rec.hoofWeightKg),
        headWeightKg: rec?.headWeightKg == null ? "" : String(rec.headWeightKg),
        ribCount: rec?.ribCount == null ? "" : String(rec.ribCount)
      }));
    } catch (e: any) {
      if (e?.status === 401) {
        clearToken();
        router.replace("/login");
        return;
      }
      setError(e?.message ?? "加载失败");
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pigId]);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await apiFetch<NonNullable<CarcassResp>>(`/pigs/${pigId}/carcass`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slaughterDate: form.slaughterDate.trim() || null,
          preSlaughterWeightKg: toNum(form.preSlaughterWeightKg),
          carcassWeightLeftKg: toNum(form.carcassWeightLeftKg),
          carcassWeightRightKg: toNum(form.carcassWeightRightKg),
          carcassLengthCm: toNum(form.carcassLengthCm),
          bodyObliqueLengthCm: toNum(form.bodyObliqueLengthCm),
          backfatShoulderMm: toNum(form.backfatShoulderMm),
          backfatLastRibMm: toNum(form.backfatLastRibMm),
          backfatLumbarMm: toNum(form.backfatLumbarMm),
          skinThickness6_7RibMm: toNum(form.skinThickness6_7RibMm),
          emaLastRibCm2: toNum(form.emaLastRibCm2),
          emaHeightCm: toNum(form.emaHeightCm),
          emaWidthCm: toNum(form.emaWidthCm),
          leftDetachSkinKg: toNum(form.leftDetachSkinKg),
          leftDetachBoneKg: toNum(form.leftDetachBoneKg),
          leftDetachFatKg: toNum(form.leftDetachFatKg),
          leftDetachLeanKg: toNum(form.leftDetachLeanKg),
          leftLegWeightKg: toNum(form.leftLegWeightKg),
          hoofWeightKg: toNum(form.hoofWeightKg),
          headWeightKg: toNum(form.headWeightKg),
          ribCount: toNum(form.ribCount)
        })
      });
      setResp(r);
      setWarnings(r.warnings ?? []);
    } catch (e: any) {
      setError(e?.message ?? "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const avgBackfat = useMemo(() => {
    const a = toNum(form.backfatShoulderMm);
    const b = toNum(form.backfatLastRibMm);
    const c = toNum(form.backfatLumbarMm);
    if (a == null || b == null || c == null) return null;
    return (a + b + c) / 3;
  }, [form.backfatShoulderMm, form.backfatLastRibMm, form.backfatLumbarMm]);

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold">胴体性状</div>
        <Link className="text-blue-600 hover:underline" href={`/pigs/${pigId}`}>
          返回猪只
        </Link>
      </div>
      {warnings.length > 0 ? (
        <div className="rounded-lg border bg-amber-50 p-4 text-sm text-amber-900">{warnings.join("；")}</div>
      ) : null}
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {/* Render sections & computed read-only values from resp?.record */}
      <div className="flex items-center gap-3">
        <button className="h-10 rounded-md bg-black px-4 text-white disabled:opacity-50" onClick={onSave} disabled={saving}>
          {saving ? "保存中..." : "保存"}
        </button>
        <button className="h-10 rounded-md border px-4" onClick={reload}>
          刷新
        </button>
        {avgBackfat != null ? <div className="text-sm text-zinc-600">平均背膘厚(mm)：{avgBackfat.toFixed(2)}</div> : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run build**

Run:

```bash
cd /workspace/apps/web
npm run build
```

Expected: PASS

---

## Task 4: End-to-end verification (local)

- [ ] **Step 1: Start API**

Run:

```bash
cd /workspace/apps/api
npm run start:dev
```

- [ ] **Step 2: Start Web**

Run:

```bash
cd /workspace/apps/web
npm run dev -- --port 3000
```

- [ ] **Step 3: Manual smoke**

- Login
- Open pigs list → pig detail
- Enter carcass page → fill minimal fields:
  - 宰前重、左右胴体重、左皮/骨/肥/瘦、左腿臀
- Save and confirm computed fields appear:
  - 屠宰率、腿臀比、皮/骨/肥/瘦率、分割损耗

---

## Self-Review Checklist (plan)

- 覆盖 spec：接口、权限、计算口径、校验、warnings、前端单页分组、后端测试、前端构建
- 无 “TODO/TBD/适当处理” 占位语
- 字段名与实体 `CarcassTraitEntity` 一致

