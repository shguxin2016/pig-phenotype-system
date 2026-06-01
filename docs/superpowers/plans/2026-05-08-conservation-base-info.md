# Conservation Base Info (Annual Form) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现保种场基本信息登记表（按年度）模块：后端按 year+unitId 的读写接口与权限隔离，前端提供年度选择 + 单页表单录入，并给出 warnings 提示。

**Architecture:** 复用现有 `ConservationBaseInfoEntity`（unitId+year 唯一，data JSON 存字段），后端新增 `BaseInfoService` 做 upsert 与校验并输出 warnings；前端新增 `/base-info` 页面，保种场只见本单位，管理单位可切换单位编辑，测定中心只读查看。

**Tech Stack:** NestJS + TypeORM；Next.js App Router；Jest + supertest。

---

## File Map

**Backend (NestJS)**
- Create: `/workspace/apps/api/src/base-info/base-info.service.ts`
- Create: `/workspace/apps/api/src/base-info/base-info.controller.ts`
- Create: `/workspace/apps/api/src/base-info/base-info.module.ts`
- Modify: `/workspace/apps/api/src/app.module.ts`
- Test: `/workspace/apps/api/src/base-info/base-info.controller.spec.ts`

**Frontend (Next.js)**
- Create: `/workspace/apps/web/src/app/base-info/page.tsx`
- (Optional) Modify: `/workspace/apps/web/src/app/page.tsx`（首页增加入口）

---

## Task 1: Backend — Module & routes

**Files:**
- Create: `/workspace/apps/api/src/base-info/base-info.module.ts`
- Create: `/workspace/apps/api/src/base-info/base-info.controller.ts`
- Create: `/workspace/apps/api/src/base-info/base-info.service.ts`
- Modify: `/workspace/apps/api/src/app.module.ts`

- [ ] **Step 1: Create module**

Create `/workspace/apps/api/src/base-info/base-info.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ConservationBaseInfoEntity, UnitEntity, PigEntity } from '../db/entities'
import { BaseInfoController } from './base-info.controller'
import { BaseInfoService } from './base-info.service'

@Module({
  imports: [TypeOrmModule.forFeature([ConservationBaseInfoEntity, UnitEntity, PigEntity])],
  controllers: [BaseInfoController],
  providers: [BaseInfoService]
})
export class BaseInfoModule {}
```

Notes:
- `UnitEntity` 用于校验 unitId 是否存在（管理单位编辑其它单位时）
- `PigEntity` 非必须；若不需要可去掉（保持最小依赖）

- [ ] **Step 2: Register module**

Modify `/workspace/apps/api/src/app.module.ts` imports to include `BaseInfoModule`.

- [ ] **Step 3: Add controller**

Create `/workspace/apps/api/src/base-info/base-info.controller.ts`:

```ts
import { Body, Controller, Get, Query, Put, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import type { JwtPayload } from '../auth/auth.types'
import { BaseInfoService } from './base-info.service'

@UseGuards(JwtAuthGuard)
@Controller('base-info')
export class BaseInfoController {
  constructor(private readonly baseInfo: BaseInfoService) {}

  @Get()
  async get(@Req() req: { user: JwtPayload }, @Query('year') year: string, @Query('unitId') unitId?: string) {
    return this.baseInfo.get(req.user, year, unitId)
  }

  @Put()
  async upsert(
    @Req() req: { user: JwtPayload },
    @Query('year') year: string,
    @Query('unitId') unitId: string | undefined,
    @Body() body: any
  ) {
    return this.baseInfo.upsert(req.user, year, unitId, body)
  }
}
```

- [ ] **Step 4: Build**

Run:

```bash
cd /workspace/apps/api
npm run build
```

Expected: PASS

---

## Task 2: Backend — Authorization, validation, warnings, tests

**Files:**
- Modify: `/workspace/apps/api/src/base-info/base-info.service.ts`
- Test: `/workspace/apps/api/src/base-info/base-info.controller.spec.ts`

- [ ] **Step 1: Implement service**

Create `/workspace/apps/api/src/base-info/base-info.service.ts`:

```ts
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { JwtPayload } from '../auth/auth.types'
import { ConservationBaseInfoEntity, UnitEntity } from '../db/entities'

type UpsertBody = { data: Record<string, unknown> }
export type BaseInfoRecord = { id: number; unitId: number; year: number; data: Record<string, unknown>; fillDate: string | null }
export type BaseInfoResponse = { record: BaseInfoRecord; warnings: string[] }

const YEAR_MIN = 2000
const YEAR_MAX = 2100
const LEVELS = ['国家级', '省级', '其他'] as const

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
  'fixedAssets10kCny'
] as const

@Injectable()
export class BaseInfoService {
  constructor(
    @InjectRepository(ConservationBaseInfoEntity) private readonly repo: Repository<ConservationBaseInfoEntity>,
    @InjectRepository(UnitEntity) private readonly units: Repository<UnitEntity>
  ) {}

  async get(user: JwtPayload, yearStr: string, unitIdStr?: string): Promise<BaseInfoRecord | null> {
    const year = parseYear(yearStr)
    const unitId = await resolveUnitIdForRead(user, unitIdStr)
    const row = await this.repo.findOne({ where: { unitId, year } })
    if (!row) return null
    return { id: row.id, unitId: row.unitId, year: row.year, data: row.data, fillDate: row.fillDate }
  }

  async upsert(user: JwtPayload, yearStr: string, unitIdStr: string | undefined, body: UpsertBody): Promise<BaseInfoResponse> {
    const year = parseYear(yearStr)
    const unitId = await resolveUnitIdForWrite(user, unitIdStr)
    await this.assertUnitExists(unitId)

    if (!body || typeof body !== 'object') throw new BadRequestException('body无效')
    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) throw new BadRequestException('data必须为对象')

    const data = body.data as Record<string, unknown>
    const warnings = validateAndWarn(data)

    const fillDate = typeof data.fillDate === 'string' && data.fillDate.trim().length > 0 ? data.fillDate.trim() : null
    if (fillDate != null && !/^\\d{4}-\\d{2}-\\d{2}$/.test(fillDate)) throw new BadRequestException('fillDate格式应为YYYY-MM-DD')

    const row = (await this.repo.findOne({ where: { unitId, year } })) ?? this.repo.create({ unitId, year, data: {}, fillDate: null })
    row.data = data
    row.fillDate = fillDate

    const saved = await this.repo.save(row)
    return { record: { id: saved.id, unitId: saved.unitId, year: saved.year, data: saved.data, fillDate: saved.fillDate }, warnings }
  }

  private async assertUnitExists(unitId: number) {
    const unit = await this.units.findOne({ where: { id: unitId } })
    if (!unit) throw new BadRequestException('unitId不存在')
  }
}

const parseYear = (s: string): number => {
  const n = Number(s)
  if (!Number.isFinite(n) || Math.trunc(n) !== n) throw new BadRequestException('year必须为整数')
  if (n < YEAR_MIN || n > YEAR_MAX) throw new BadRequestException(`year范围应为[${YEAR_MIN},${YEAR_MAX}]`)
  return n
}

const resolveUnitIdForRead = async (user: JwtPayload, unitIdStr?: string): Promise<number> => {
  if (user.role === '保种场') return user.unitId
  if (user.role === '测定中心') {
    if (!unitIdStr) throw new BadRequestException('unitId必填')
    return parseUnitId(unitIdStr)
  }
  if (user.role === '管理单位') {
    if (unitIdStr) return parseUnitId(unitIdStr)
    return user.unitId
  }
  throw new ForbiddenException('无权限')
}

const resolveUnitIdForWrite = async (user: JwtPayload, unitIdStr?: string): Promise<number> => {
  if (user.role === '测定中心') throw new ForbiddenException('无权限')
  if (user.role === '保种场') return user.unitId
  if (user.role === '管理单位') {
    if (unitIdStr) return parseUnitId(unitIdStr)
    return user.unitId
  }
  throw new ForbiddenException('无权限')
}

const parseUnitId = (s: string): number => {
  const n = Number(s)
  if (!Number.isFinite(n) || Math.trunc(n) !== n) throw new BadRequestException('unitId必须为整数')
  return n
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

const validateAndWarn = (data: Record<string, unknown>): string[] => {
  const warnings: string[] = []

  const level = data.level
  if (typeof level === 'string' && !LEVELS.includes(level as any)) throw new BadRequestException('level取值无效')

  for (const k of numberKeys) {
    const v = data[k]
    if (typeof v === 'undefined' || v === null || v === '') continue
    if (!isFiniteNumber(v) || v < 0) throw new BadRequestException(`${k}必须为非负数`)
  }

  const requiredHint: (keyof typeof data)[] = ['name', 'address', 'protectedBreedName'] as any
  for (const k of requiredHint) {
    const v = (data as any)[k]
    if (typeof v !== 'string' || v.trim().length === 0) warnings.push(`缺少关键字段：${String(k)}`)
  }

  const email = data.email
  if (typeof email === 'string' && email.trim().length > 0) {
    if (!/^\\S+@\\S+\\.\\S+$/.test(email.trim())) warnings.push('邮箱格式可能不正确')
  }

  const phone = data.phone
  if (typeof phone === 'string' && phone.trim().length > 0) {
    if (!/^[0-9+\\-()\\s]{6,}$/.test(phone.trim())) warnings.push('电话格式可能不正确')
  }

  return warnings
}
```

- [ ] **Step 2: Add tests**

Create `/workspace/apps/api/src/base-info/base-info.controller.spec.ts`:

```ts
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../app.module'
import { UserEntity } from '../db/entities'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { hashPassword } from '../auth/password'

describe('BaseInfoController', () => {
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

  it('farm writes its own unit and ignores unitId', async () => {
    await startApp()
    await userRepo.save(
      userRepo.create({ username: 'farm', unitId: 1, role: '保种场', passwordHash: await hashPassword('farm-pass'), isActive: true })
    )
    const token = await login('farm', '上海市嘉定区动物疫病预防控制中心', 'farm-pass')

    const up = await request(app.getHttpServer())
      .put('/base-info?year=2026&unitId=2')
      .set('Authorization', `Bearer ${token}`)
      .send({ data: { name: 'A', level: '国家级', protectedBreedName: '梅山猪', landAreaM2: 1, fillDate: '2026-01-01' } })
    expect(up.status).toBe(200)
    expect(up.body.record.unitId).toBe(1)
  })

  it('management can edit other unit', async () => {
    await startApp()
    const token = await login('admin', '上海市动物疫病预防控制中心', 'test-password')
    const up = await request(app.getHttpServer())
      .put('/base-info?year=2026&unitId=2')
      .set('Authorization', `Bearer ${token}`)
      .send({ data: { name: 'B', level: '省级', protectedBreedName: '梅山猪', landAreaM2: 2 } })
    expect(up.status).toBe(200)
    expect(up.body.record.unitId).toBe(2)
  })

  it('test center is read-only', async () => {
    await startApp()
    await userRepo.save(
      userRepo.create({ username: 'tc', unitId: 4, role: '测定中心', passwordHash: await hashPassword('tc-pass'), isActive: true })
    )
    const token = await login('tc', '上海市青浦区动物疫病预防控制中心', 'tc-pass')
    const up = await request(app.getHttpServer())
      .put('/base-info?year=2026&unitId=1')
      .set('Authorization', `Bearer ${token}`)
      .send({ data: { name: 'C' } })
    expect(up.status).toBe(403)
  })
})
```

- [ ] **Step 3: Run tests/build**

Run:

```bash
cd /workspace/apps/api
npm test -- --runInBand
npm run build
```

Expected: PASS

---

## Task 3: Frontend — /base-info page

**Files:**
- Create: `/workspace/apps/web/src/app/base-info/page.tsx`

- [ ] **Step 1: Implement page (role-aware)**

Create `/workspace/apps/web/src/app/base-info/page.tsx`:

- Load units: `GET /meta/units`
- Determine role:
  - Use `GET /auth/me` if exists; if not, rely on token payload decode (or add minimal `/auth/me` endpoint first)
- Year selector: default current year (client `new Date().getFullYear()`)
- Unit selector:
  - 管理单位：可选 unitId
  - 测定中心：必须选 unitId
  - 保种场：隐藏 unit selector
- GET record: `/base-info?year=YYYY&unitId=...`（unitId 仅在允许时带上）
- PUT save: `/base-info?year=YYYY&unitId=...` body `{ data }`
- Show warnings in amber box; show errors in red
- Sections per spec

- [ ] **Step 2: Run build**

Run:

```bash
cd /workspace/apps/web
npm run build
```

Expected: PASS

---

## Self-Review Checklist (plan)

- 覆盖 spec：接口、权限、字段字典、校验/warnings、前端角色差异
- 无占位语；year/unitId 解析规则明确

