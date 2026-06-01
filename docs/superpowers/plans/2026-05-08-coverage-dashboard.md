# Coverage Dashboard (Unit×Breed) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现统计总览（覆盖率）第一版：按“单位×品种”聚合档案数与各模块已录入数，并提供表格页面展示与筛选。

**Architecture:** API 端新增 `stats` 模块提供 `/stats/coverage` 聚合查询，采用一次 SQL 聚合（Pig 基表 + 各模块 left join + COUNT DISTINCT）返回 counts；Web 端新增 `/stats/coverage` 页面，按角色展示筛选器与表格。

**Tech Stack:** NestJS + TypeORM；Next.js App Router；Jest + supertest。

---

## File Map

**Backend (NestJS)**
- Create: `/workspace/apps/api/src/stats/stats.module.ts`
- Create: `/workspace/apps/api/src/stats/stats.controller.ts`
- Create: `/workspace/apps/api/src/stats/stats.service.ts`
- Modify: `/workspace/apps/api/src/app.module.ts`
- Test: `/workspace/apps/api/src/stats/stats.controller.spec.ts`

**Frontend (Next.js)**
- Create: `/workspace/apps/web/src/app/stats/coverage/page.tsx`
- (Optional) Modify: `/workspace/apps/web/src/app/page.tsx`（首页入口）

---

## Task 1: Backend — stats module + endpoint

**Files:**
- Create: `/workspace/apps/api/src/stats/stats.module.ts`
- Create: `/workspace/apps/api/src/stats/stats.controller.ts`
- Create: `/workspace/apps/api/src/stats/stats.service.ts`
- Modify: `/workspace/apps/api/src/app.module.ts`

- [ ] **Step 1: Create module**

```ts
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BreedEntity, CarcassTraitEntity, GrowthTestEntity, MeatQualityEntity, PigEntity, ReproPigletEntity, UnitEntity } from '../db/entities'
import { StatsController } from './stats.controller'
import { StatsService } from './stats.service'

@Module({
  imports: [TypeOrmModule.forFeature([PigEntity, UnitEntity, BreedEntity, GrowthTestEntity, ReproPigletEntity, CarcassTraitEntity, MeatQualityEntity])],
  controllers: [StatsController],
  providers: [StatsService]
})
export class StatsModule {}
```

- [ ] **Step 2: Register module**

Add `StatsModule` into `/workspace/apps/api/src/app.module.ts` imports.

- [ ] **Step 3: Add controller**

Create `/workspace/apps/api/src/stats/stats.controller.ts`:

```ts
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import type { JwtPayload } from '../auth/auth.types'
import { StatsService } from './stats.service'

@UseGuards(JwtAuthGuard)
@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('coverage')
  async coverage(@Req() req: { user: JwtPayload }, @Query('unitId') unitId?: string, @Query('breedId') breedId?: string) {
    return this.stats.coverage(req.user, unitId, breedId)
  }
}
```

- [ ] **Step 4: Implement service query**

Create `/workspace/apps/api/src/stats/stats.service.ts` to:
- apply role-based unitId scoping
- run one aggregated query returning per (unitId, breedId) counts + names
- compute totals (sum of each count) in service

Core query approach (TypeORM QB pseudo):
- from `pig` p
- join `unit` u on u.id=p.unitId
- join `breed` b on b.id=p.breedId
- left join `growth_test` g on g.pigId=p.id
- left join `repro_piglet` rp on rp.pigId=p.id
- left join `carcass_trait` c on c.pigId=p.id
- left join `meat_quality` m on m.pigId=p.id
- group by `p.unitId, p.breedId, u.name, b.name`
- selects:
  - registryCount = COUNT(p.id)
  - growthCount = COUNT(DISTINCT g.pigId)
  - reproCount = COUNT(DISTINCT rp.pigId)
  - carcassCount = COUNT(DISTINCT c.pigId)
  - meatqCount = COUNT(DISTINCT m.pigId)

- [ ] **Step 5: Build**

```bash
cd /workspace/apps/api
npm run build
```

Expected: PASS

---

## Task 2: Backend — tests

**Files:**
- Test: `/workspace/apps/api/src/stats/stats.controller.spec.ts`

- [ ] **Step 1: Add test data and assert counts**

Test flow:
- start sqljs app
- login admin token
- create pigs across 2 units & 2 breeds
- create partial module records (growth/repro/carcass/meatq) for some pigs
- call `/stats/coverage` and assert:
  - rows include 4 groups
  - each group registryCount equals number of pigs in that unit×breed
  - module counts correct (distinct pigId)
- add farm user and assert farm sees only own unit rows

- [ ] **Step 2: Run tests**

```bash
cd /workspace/apps/api
npm test -- --runInBand
```

Expected: PASS

---

## Task 3: Frontend — /stats/coverage page

**Files:**
- Create: `/workspace/apps/web/src/app/stats/coverage/page.tsx`

- [ ] **Step 1: Page skeleton**

Client page:
- fetch `/meta/units` and `/meta/breeds` for filters
- role detection：
  - if API already exposes role in token only, add a minimal `/auth/me` endpoint first; otherwise decode JWT payload client-side (preferred: `/auth/me`)
- filters:
  - unit selector visible for 管理单位/测定中心
  - breed selector visible for all
- fetch `GET /stats/coverage?unitId=&breedId=`
- render table rows = unit×breed
  - show counts and computed pct strings like `12/30 (40.0%)`
- sorting: client-side sort by registryCount or chosen module coverage

- [ ] **Step 2: Build**

```bash
cd /workspace/apps/web
npm run build
```

Expected: PASS

---

## Self-Review Checklist (plan)

- 指标口径：分母为档案数；分子为“存在记录”的猪只数（distinct pigId）
- 权限：保种场强制 unitId；测定中心/管理单位全量只读
- 页面：第一版行表，后续再加矩阵视图

