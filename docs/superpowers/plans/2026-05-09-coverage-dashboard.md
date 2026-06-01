# Coverage Dashboard (Unit×Breed) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Task 11：统计总览（覆盖率）第一版：按“单位×品种”聚合档案数与各模块已录入数，并提供 `/stats/coverage` 页面展示与筛选；在 `/excel` 页面顶部增加入口。

**Architecture:** API 端新增 `stats` 模块提供 `/stats/coverage` 聚合查询，采用一次 SQL 聚合（Pig 基表 + 各模块 left join + COUNT DISTINCT）返回 counts；Web 端新增 `/stats/coverage` 页面，按角色展示筛选器与表格，前端计算 pct 并支持排序。

**Tech Stack:** NestJS + TypeORM；Next.js App Router；Jest + supertest。

---

## File Map

**Backend**
- Create: [stats.module.ts](file:///workspace/apps/api/src/stats/stats.module.ts)
- Create: [stats.controller.ts](file:///workspace/apps/api/src/stats/stats.controller.ts)
- Create: [stats.service.ts](file:///workspace/apps/api/src/stats/stats.service.ts)
- Modify: [app.module.ts](file:///workspace/apps/api/src/app.module.ts)
- Test: [stats.controller.spec.ts](file:///workspace/apps/api/src/stats/stats.controller.spec.ts)

**Frontend**
- Create: [stats/coverage/page.tsx](file:///workspace/apps/web/src/app/stats/coverage/page.tsx)
- Modify: [excel/page.tsx](file:///workspace/apps/web/src/app/excel/page.tsx)

---

## Task 1: Backend — stats module + endpoint

**Files:**
- Create: [stats.module.ts](file:///workspace/apps/api/src/stats/stats.module.ts)
- Create: [stats.controller.ts](file:///workspace/apps/api/src/stats/stats.controller.ts)
- Create: [stats.service.ts](file:///workspace/apps/api/src/stats/stats.service.ts)
- Modify: [app.module.ts](file:///workspace/apps/api/src/app.module.ts)

- [ ] **Step 1: Create StatsModule**

Create `apps/api/src/stats/stats.module.ts`:

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

- [ ] **Step 2: Register StatsModule**

Add into `apps/api/src/app.module.ts` imports.

- [ ] **Step 3: Add controller**

Create `apps/api/src/stats/stats.controller.ts`:

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
  async coverage(
    @Req() req: { user: JwtPayload },
    @Query('unitId') unitId?: string,
    @Query('breedId') breedId?: string
  ) {
    return this.stats.coverage(req.user, unitId, breedId)
  }
}
```

- [ ] **Step 4: Implement service query**

Create `apps/api/src/stats/stats.service.ts`:
- role-based scoping:
  - 保种场：忽略 unitId，强制 user.unitId
  - 测定中心/管理单位：unitId/breedId 可选过滤
- one aggregated query returning per (unitId, breedId) counts + names:
  - registryCount = COUNT(p.id)
  - growthCount = COUNT(DISTINCT g.pigId)
  - reproCount = COUNT(DISTINCT rp.pigId)
  - carcassCount = COUNT(DISTINCT c.pigId)
  - meatqCount = COUNT(DISTINCT m.pigId)
- totals: sums of each count across rows

- [ ] **Step 5: Build**

```bash
cd /workspace/apps/api
npm run build
```

Expected: PASS

---

## Task 2: Backend — tests

**Files:**
- Create: [stats.controller.spec.ts](file:///workspace/apps/api/src/stats/stats.controller.spec.ts)

- [ ] **Step 1: Add test data and assert counts**

Test flow:
- start sqljs app
- login admin token
- create pigs across 2 units × 2 breeds
- create partial module records (growth/repro/carcass/meatq) for some pigs
- call `/stats/coverage` assert rows counts and totals
- create 保种场用户并 assert 只能看到本单位 rows

- [ ] **Step 2: Run unit tests**

```bash
cd /workspace/apps/api
npm test -- --runInBand
```

Expected: PASS

---

## Task 3: Frontend — /stats/coverage page

**Files:**
- Create: [stats/coverage/page.tsx](file:///workspace/apps/web/src/app/stats/coverage/page.tsx)

- [ ] **Step 1: Page skeleton & auth**

复用 [excel/page.tsx](file:///workspace/apps/web/src/app/excel/page.tsx) 的模式：
- decode JWT payload 获取 role/unitId
- 若无 token 跳 `/login`
- 拉取 `/meta/units`（auth:false）和 `/meta/breeds`（auth:false）

- [ ] **Step 2: Filters**

- unit selector：
  - 保种场隐藏
  - 测定中心/管理单位可选
- breed selector：全角色可选

- [ ] **Step 3: Fetch & render**

- GET `/stats/coverage?unitId=&breedId=`
- 表格列：
  - 单位、品种、档案数
  - 生长/繁殖/胴体/肉质：显示 `x/y (pct%)`
- 排序：客户端排序（按档案数或某模块 pct）

- [ ] **Step 4: Build**

```bash
cd /workspace/apps/web
npm run build
```

Expected: PASS

---

## Task 4: Frontend — add entry in /excel

**Files:**
- Modify: [excel/page.tsx](file:///workspace/apps/web/src/app/excel/page.tsx)

- [ ] **Step 1: Add link**

在 Excel 页顶部增加入口：

```tsx
<Link className="text-blue-600 hover:underline" href="/stats/coverage">
  覆盖率统计
</Link>
```

---

## Task 5: Full verification

- [ ] **Backend**

```bash
cd /workspace/apps/api
npm test -- --runInBand
npm run build
npm run test:e2e -- --runInBand
```

- [ ] **Frontend**

```bash
cd /workspace/apps/web
npm run build
```

