# Meat Quality (NY/T 821-2019) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为每头测定猪只提供猪肉品质录入、按 NY/T 821-2019 的范围校验与结果评判 warnings，并在前端提供单页分组录入页。

**Architecture:** 后端新增 `MeatqService` 对 `MeatQualityEntity` 做按 pigId 的 upsert，保存前执行标准化与强校验，随后根据 NY/T 821-2019 输出“结果评判” warnings（不阻断保存）；前端新增 `/pigs/[pigId]/meatq` 单页分组表单，保存后展示 warnings。

**Tech Stack:** NestJS + TypeORM；Next.js App Router；Jest + supertest。

---

## File Map

**Backend (NestJS)**
- Create: `/workspace/apps/api/src/meatq/meatq.service.ts`
- Create: `/workspace/apps/api/src/meatq/meatq.controller.ts`
- Create: `/workspace/apps/api/src/meatq/meatq.module.ts`
- Modify: `/workspace/apps/api/src/app.module.ts`
- Test: `/workspace/apps/api/src/meatq/meatq.controller.spec.ts`

**Frontend (Next.js)**
- Modify: `/workspace/apps/web/src/app/pigs/[pigId]/page.tsx`
- Create: `/workspace/apps/web/src/app/pigs/[pigId]/meatq/page.tsx`

---

## Task 1: Backend — Meatq module skeleton

**Files:**
- Create: `/workspace/apps/api/src/meatq/meatq.module.ts`
- Create: `/workspace/apps/api/src/meatq/meatq.controller.ts`
- Create: `/workspace/apps/api/src/meatq/meatq.service.ts`
- Modify: `/workspace/apps/api/src/app.module.ts`

- [ ] **Step 1: Add module wiring**

Create `/workspace/apps/api/src/meatq/meatq.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { MeatQualityEntity, PigEntity } from '../db/entities'
import { MeatqController } from './meatq.controller'
import { MeatqService } from './meatq.service'

@Module({
  imports: [TypeOrmModule.forFeature([MeatQualityEntity, PigEntity])],
  controllers: [MeatqController],
  providers: [MeatqService]
})
export class MeatqModule {}
```

- [ ] **Step 2: Register module**

Modify `/workspace/apps/api/src/app.module.ts` to include `MeatqModule` in imports.

- [ ] **Step 3: Add controller routes**

Create `/workspace/apps/api/src/meatq/meatq.controller.ts`:

```ts
import { Body, Controller, Get, Param, ParseIntPipe, Put, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import type { JwtPayload } from '../auth/auth.types'
import { MeatqService } from './meatq.service'

@UseGuards(JwtAuthGuard)
@Controller('pigs/:pigId/meatq')
export class MeatqController {
  constructor(private readonly meatq: MeatqService) {}

  @Get()
  async get(@Req() req: { user: JwtPayload }, @Param('pigId', ParseIntPipe) pigId: number) {
    return this.meatq.get(req.user, pigId)
  }

  @Put()
  async upsert(@Req() req: { user: JwtPayload }, @Param('pigId', ParseIntPipe) pigId: number, @Body() body: any) {
    return this.meatq.upsert(req.user, pigId, body)
  }
}
```

- [ ] **Step 4: Run build**

Run:

```bash
cd /workspace/apps/api
npm run build
```

Expected: PASS

---

## Task 2: Backend — Validations & NY/T 821 warnings

**Files:**
- Modify: `/workspace/apps/api/src/meatq/meatq.service.ts`
- Test: `/workspace/apps/api/src/meatq/meatq.controller.spec.ts`

- [ ] **Step 1: Implement service with strong validation + warnings**

Create `/workspace/apps/api/src/meatq/meatq.service.ts`:

```ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { JwtPayload } from '../auth/auth.types'
import { MeatQualityEntity, PigEntity } from '../db/entities'

type MeatqInput = Partial<{
  sex: string | null
  colorScore: number | null
  colorL: number | null
  colorA: number | null
  colorB: number | null
  ph1h: number | null
  ph24h: number | null
  dripLossPct: number | null
  waterHoldingPct: number | null
  marblingScore: number | null
  imfPct: number | null
  impPct: number | null
  moisturePct: number | null
  tendernessShearN: number | null
  cookedMeatRate: number | null
  remark: string | null
}>

export type MeatqResponse = { record: MeatQualityEntity; warnings: string[] }

@Injectable()
export class MeatqService {
  constructor(
    @InjectRepository(MeatQualityEntity) private readonly meatq: Repository<MeatQualityEntity>,
    @InjectRepository(PigEntity) private readonly pigs: Repository<PigEntity>
  ) {}

  async get(user: JwtPayload, pigId: number): Promise<MeatqResponse | null> {
    await this.requirePig(user, pigId)
    const record = await this.meatq.findOne({ where: { pigId } })
    if (!record) return null
    return { record, warnings: computeWarnings(record) }
  }

  async upsert(user: JwtPayload, pigId: number, input: MeatqInput): Promise<MeatqResponse> {
    await this.requirePig(user, pigId)
    const record =
      (await this.meatq.findOne({ where: { pigId } })) ??
      this.meatq.create({
        pigId
      })

    Object.assign(record, normalizeInput(input))
    validateStrong(record)
    const warnings = computeWarnings(record)

    const saved = await this.meatq.save(record)
    return { record: saved, warnings }
  }

  private async requirePig(user: JwtPayload, pigId: number) {
    const pig = await this.pigs.findOne({ where: { id: pigId } })
    if (!pig) throw new NotFoundException('猪只不存在')
    if (user.role === '保种场' && pig.unitId !== user.unitId) throw new ForbiddenException('无权限访问该猪只')
    return pig
  }
}

const normalizeInput = (i: MeatqInput) => {
  const out: any = {}
  for (const [k, v] of Object.entries(i ?? {})) {
    if (typeof v === 'undefined') continue
    if (typeof v === 'string') out[k] = v.trim().length === 0 ? null : v.trim()
    else out[k] = v
  }
  return out
}

const assertFinite = (name: string, v: unknown) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new BadRequestException(`${name}必须为数值`)
}

const assertRange = (name: string, v: number, min: number, max: number, leftOpen = false) => {
  if ((leftOpen ? v <= min : v < min) || v > max) {
    throw new BadRequestException(`${name}范围应为${leftOpen ? '(' : '['}${min},${max}]`)
  }
}

const assertScore = (name: string, v: number) => {
  if (v < 1 || v > 6) throw new BadRequestException(`${name}范围应为[1,6]`)
  const twice = Math.round(v * 2)
  if (Math.abs(v * 2 - twice) > 1e-9) throw new BadRequestException(`${name}仅允许0.5分档`)
}

const validateStrong = (r: MeatQualityEntity) => {
  if (r.ph1h != null) {
    assertFinite('ph1h', r.ph1h)
    assertRange('ph1h', r.ph1h, 0, 14, true)
  }
  if (r.ph24h != null) {
    assertFinite('ph24h', r.ph24h)
    assertRange('ph24h', r.ph24h, 0, 14, true)
  }

  const pctFields: { key: keyof MeatQualityEntity; name: string }[] = [
    { key: 'dripLossPct', name: 'dripLossPct' },
    { key: 'waterHoldingPct', name: 'waterHoldingPct' },
    { key: 'imfPct', name: 'imfPct' },
    { key: 'impPct', name: 'impPct' },
    { key: 'moisturePct', name: 'moisturePct' },
    { key: 'cookedMeatRate', name: 'cookedMeatRate' }
  ]
  for (const f of pctFields) {
    const v = r[f.key] as any
    if (v == null) continue
    assertFinite(f.name, v)
    assertRange(f.name, v, 0, 100)
  }

  if (r.colorScore != null) {
    assertFinite('colorScore', r.colorScore)
    assertScore('colorScore', r.colorScore)
  }
  if (r.marblingScore != null) {
    assertFinite('marblingScore', r.marblingScore)
    assertScore('marblingScore', r.marblingScore)
  }

  if (r.colorL != null) assertFinite('colorL', r.colorL)
  if (r.colorA != null) assertFinite('colorA', r.colorA)
  if (r.colorB != null) assertFinite('colorB', r.colorB)

  if (r.tendernessShearN != null) {
    assertFinite('tendernessShearN', r.tendernessShearN)
    if (r.tendernessShearN < 0) throw new BadRequestException('tendernessShearN必须为非负数')
  }
}

const computeWarnings = (r: MeatQualityEntity): string[] => {
  const warnings: string[] = []

  const L = r.colorL
  if (L != null) {
    if (L >= 60) warnings.push('肉色：L值≥60，PSE肉（NY/T 821）')
    else if (L >= 53) warnings.push('肉色：L值53~59，趋近PSE肉（NY/T 821）')
    else if (L >= 37) warnings.push('肉色：L值37~52，正常肉色（NY/T 821）')
    else if (L >= 31) warnings.push('肉色：L值31~36，趋近DFD肉（NY/T 821）')
    else warnings.push('肉色：L值≤30，DFD肉（NY/T 821）')
  }

  const ph1 = r.ph1h
  const ph24 = r.ph24h
  if (ph1 != null || ph24 != null) {
    if ((ph1 != null && ph1 < 5.9) || (ph24 != null && ph24 < 5.6)) warnings.push('pH：偏低，PSE肉（NY/T 821）')
    else if ((ph1 != null && ph1 > 6.5) || (ph24 != null && ph24 > 6.0)) warnings.push('pH：偏高，DFD肉（NY/T 821）')
    else warnings.push('pH：正常范围（NY/T 821）')
  }

  const dl = r.dripLossPct
  if (dl != null) {
    if (dl > 5.0) warnings.push('滴水损失：>5.0%，PSE肉（NY/T 821）')
    else if (dl < 1.5) warnings.push('滴水损失：<1.5%，DFD肉（NY/T 821）')
    else warnings.push('滴水损失：1.5%~5.0%，正常肉（NY/T 821）')
  }

  const mb = r.marblingScore
  if (mb != null) {
    const approx = mb <= 1 ? '约1.0%' : mb === 2 ? '约2.0%' : mb === 3 ? '约3.0%' : mb === 4 ? '约4.0%' : mb === 5 ? '约5.0%' : '约6.0%以上'
    warnings.push(`大理石纹：${mb}分（肌内脂肪${approx}，NY/T 821）`)
  }

  return warnings
}
```

- [ ] **Step 2: Add controller tests**

Create `/workspace/apps/api/src/meatq/meatq.controller.spec.ts`:

```ts
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../app.module'
import { UserEntity } from '../db/entities'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { hashPassword } from '../auth/password'

describe('MeatqController', () => {
  let app: INestApplication
  let userRepo: Repository<UserEntity>

  const startApp = async () => {
    process.env.DB_TYPE = 'sqljs'
    process.env.DB_SQLJS_PATH = `data/test-${Date.now()}-${Math.random()}.sqlite`
    process.env.ADMIN_USERNAME = 'admin'
    process.env.ADMIN_INIT_PASSWORD = 'test-password'
    process.env.JWT_SECRET = 'test-secret'

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    userRepo = moduleRef.get<Repository<UserEntity>>(getRepositoryToken(UserEntity))
  }

  afterEach(async () => {
    if (app) await app.close()
  })

  const login = async (username: string, unitName: string, password: string) => {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ username, unitName, password })
    expect(res.status).toBe(201)
    return res.body.accessToken as string
  }

  it('produces NYT821 warnings', async () => {
    await startApp()
    const token = await login('admin', '上海市动物疫病预防控制中心', 'test-password')

    const pigRes = await request(app.getHttpServer())
      .post('/pigs')
      .set('Authorization', `Bearer ${token}`)
      .send({ unitId: 1, breedId: 1, individualNo: 'M1', earTagNo: 'M-E001', sex: '母', birthDate: '2026-01-01' })
    expect(pigRes.status).toBe(201)
    const pigId = pigRes.body.id

    const up = await request(app.getHttpServer())
      .put(`/pigs/${pigId}/meatq`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        colorL: 61,
        ph1h: 5.8,
        ph24h: 5.5,
        dripLossPct: 6,
        marblingScore: 3
      })
    expect(up.status).toBe(200)
    expect(up.body.warnings.join(' ')).toContain('PSE')
    expect(up.body.warnings.join(' ')).toContain('滴水损失')
  })

  it('enforces strong validation', async () => {
    await startApp()
    const token = await login('admin', '上海市动物疫病预防控制中心', 'test-password')

    const pigRes = await request(app.getHttpServer())
      .post('/pigs')
      .set('Authorization', `Bearer ${token}`)
      .send({ unitId: 1, breedId: 1, individualNo: 'M2', earTagNo: 'M-E002', sex: '母', birthDate: '2026-01-01' })
    expect(pigRes.status).toBe(201)

    const res = await request(app.getHttpServer())
      .put(`/pigs/${pigRes.body.id}/meatq`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dripLossPct: 120 })
    expect(res.status).toBe(400)
  })

  it('scopes farm user to its unit', async () => {
    await startApp()
    await userRepo.save(
      userRepo.create({
        username: 'farm',
        unitId: 1,
        role: '保种场',
        passwordHash: await hashPassword('farm-pass'),
        isActive: true
      })
    )
    const token = await login('farm', '上海市嘉定区动物疫病预防控制中心', 'farm-pass')

    const adminToken = await login('admin', '上海市动物疫病预防控制中心', 'test-password')
    const pig = await request(app.getHttpServer())
      .post('/pigs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ unitId: 2, breedId: 1, individualNo: 'M3', earTagNo: 'M-E003', sex: '母', birthDate: '2026-01-01' })
    expect(pig.status).toBe(201)

    const res = await request(app.getHttpServer())
      .put(`/pigs/${pig.body.id}/meatq`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dripLossPct: 3 })
    expect(res.status).toBe(403)
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

## Task 3: Frontend — Meatq single-page form

**Files:**
- Modify: `/workspace/apps/web/src/app/pigs/[pigId]/page.tsx`
- Create: `/workspace/apps/web/src/app/pigs/[pigId]/meatq/page.tsx`

- [ ] **Step 1: Add entry link**

Modify `/workspace/apps/web/src/app/pigs/[pigId]/page.tsx` add:

```tsx
<Link className="text-blue-600 hover:underline" href={`/pigs/${pigId}/meatq`}>
  猪肉品质
</Link>
```

- [ ] **Step 2: Implement page**

Create `/workspace/apps/web/src/app/pigs/[pigId]/meatq/page.tsx` similar to carcass/growth/repro:

- Load pig: `GET /pigs/:pigId`
- Load record: `GET /pigs/:pigId/meatq`
- Save: `PUT /pigs/:pigId/meatq`
- Show warnings in amber box
- Sections per spec; inputs as text fields (numbers) with placeholder units

- [ ] **Step 3: Run build**

Run:

```bash
cd /workspace/apps/web
npm run build
```

Expected: PASS

---

## Self-Review Checklist (plan)

- 覆盖 spec：接口、权限、强校验、warnings 判定、前端页面、后端测试、前端构建
- 字段名与 `MeatQualityEntity` 一致（ph1h/ph24h 等）
- warnings 仅提示，不阻断保存

