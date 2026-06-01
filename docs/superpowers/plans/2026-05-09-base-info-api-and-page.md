# Base Info (Annual Form) API + Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 Task 9：实现 `/base-info` 后端 GET/PUT 接口（按 unitId+year 单条，含权限、强校验与 warnings），并实现前端 `/base-info` 单页表单（年度选择、管理单位可切换单位、测定中心只读），同时在 `/pigs` 页面顶部增加入口链接。

**Architecture:** 后端新增 BaseInfoModule/BaseInfoService/BaseInfoController，直接操作 `ConservationBaseInfoEntity`（`(unitId,year)` 唯一、`data` JSON 存字段、`fillDate` 独立列）。前端页面延续当前 web 工程的“无 UI 库、原生表单 + apiFetch + jwt payload 解码”的模式，字段按 spec 分 3 个区块展示并保存 whole `data` JSON。

**Tech Stack:** NestJS + TypeORM；Next.js App Router + fetch/apiFetch；Jest + supertest。

---

## Locked Decisions

- 页面入口：在 `/pigs` 页面顶部加入口链接到 `/base-info`
- 前端字段：按字段字典全量展示（基础信息/群体规模/资源与填报）
- 权限：
  - 保种场：仅可读写本单位（忽略 unitId）
  - 管理单位：可按 unitId+year 读写任意单位；未传 unitId 默认 user.unitId
  - 测定中心：全量只读；GET 必须传 unitId；PUT 403

---

## File Map

**Backend**
- Create: [base-info.module.ts](file:///workspace/apps/api/src/base-info/base-info.module.ts)
- Create: [base-info.controller.ts](file:///workspace/apps/api/src/base-info/base-info.controller.ts)
- Create: [base-info.service.ts](file:///workspace/apps/api/src/base-info/base-info.service.ts)
- Modify: [app.module.ts](file:///workspace/apps/api/src/app.module.ts)
- Test: [base-info.controller.spec.ts](file:///workspace/apps/api/src/base-info/base-info.controller.spec.ts)

**Frontend**
- Create: [base-info/page.tsx](file:///workspace/apps/web/src/app/base-info/page.tsx)
- Modify: [pigs/page.tsx](file:///workspace/apps/web/src/app/pigs/page.tsx)

---

## Task 1: Backend — Module & wiring

**Files:**
- Create: [base-info.module.ts](file:///workspace/apps/api/src/base-info/base-info.module.ts)
- Modify: [app.module.ts](file:///workspace/apps/api/src/app.module.ts)

- [ ] **Step 1: Create BaseInfoModule**

Create `apps/api/src/base-info/base-info.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ConservationBaseInfoEntity, UnitEntity } from '../db/entities'
import { BaseInfoController } from './base-info.controller'
import { BaseInfoService } from './base-info.service'

@Module({
  imports: [TypeOrmModule.forFeature([ConservationBaseInfoEntity, UnitEntity])],
  controllers: [BaseInfoController],
  providers: [BaseInfoService]
})
export class BaseInfoModule {}
```

- [ ] **Step 2: Register BaseInfoModule**

Modify `apps/api/src/app.module.ts` imports array, add `BaseInfoModule`.

- [ ] **Step 3: Build**

```bash
cd /workspace/apps/api
npm run build
```

Expected: PASS

---

## Task 2: Backend — Controller + service (auth, validation, warnings)

**Files:**
- Create: [base-info.controller.ts](file:///workspace/apps/api/src/base-info/base-info.controller.ts)
- Create: [base-info.service.ts](file:///workspace/apps/api/src/base-info/base-info.service.ts)

- [ ] **Step 1: Add controller**

Create `apps/api/src/base-info/base-info.controller.ts`:

```ts
import { Body, Controller, Get, Put, Query, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import type { JwtPayload } from '../auth/auth.types'
import { BaseInfoService } from './base-info.service'

@UseGuards(JwtAuthGuard)
@Controller('base-info')
export class BaseInfoController {
  constructor(private readonly baseInfo: BaseInfoService) {}

  @Get()
  async get(
    @Req() req: { user: JwtPayload },
    @Query('year') year: string,
    @Query('unitId') unitId?: string
  ) {
    return this.baseInfo.get(req.user, year, unitId)
  }

  @Put()
  async upsert(
    @Req() req: { user: JwtPayload },
    @Query('year') year: string,
    @Query('unitId') unitId: string | undefined,
    @Body() body: unknown
  ) {
    return this.baseInfo.upsert(req.user, year, unitId, body)
  }
}
```

- [ ] **Step 2: Implement service**

Create `apps/api/src/base-info/base-info.service.ts` with:
- `parseYear()`：整数 [2000,2100]
- `parseUnitId()`：正整数
- `resolveUnitIdForRead()` / `resolveUnitIdForWrite()`：按 Locked Decisions 实现
- `validateStrong(data)`：阻断校验
  - `data` 必须为对象
  - number keys 必须为有限数值且 >=0
  - `level` 必须为 `国家级/省级/其他`
  - `fillDate` 若存在必须 YYYY-MM-DD
- `warnings`：不阻断
  - `email` 基本格式
  - `phone` 基本格式
  - 缺失 `name/address/protectedBreedName` 警告
- upsert：按 `(unitId,year)` 查找后 save；并把 `data.fillDate` 同步到实体列 `fillDate`

Service 返回：
- GET：`null` 或 `{ id, unitId, year, data, fillDate }`
- PUT：`{ record, warnings }`

---

## Task 3: Backend — Tests

**Files:**
- Create: [base-info.controller.spec.ts](file:///workspace/apps/api/src/base-info/base-info.controller.spec.ts)

- [ ] **Step 1: Add spec tests (role matrix)**

新增 4 组测试（沿用其它 controller.spec.ts 的登录与 token 模式）：
- 保种场：PUT 传 unitId=999 仍只能写 `user.unitId`；GET 忽略 unitId
- 管理单位：可写 unitId=1 与 unitId=2 两条不同单位；GET 默认 unitId=user.unitId
- 测定中心：PUT 403；GET 若未传 unitId 400，传 unitId 正常返回
- `(unitId,year)` upsert：同一年二次 PUT 覆盖同一条（id 不变）

- [ ] **Step 2: Run api unit tests**

```bash
cd /workspace/apps/api
npm test -- --runInBand
```

Expected: PASS

---

## Task 4: Frontend — /base-info page

**Files:**
- Create: [base-info/page.tsx](file:///workspace/apps/web/src/app/base-info/page.tsx)

- [ ] **Step 1: Create page skeleton**

实现方式参照 [excel/page.tsx](file:///workspace/apps/web/src/app/excel/page.tsx)：
- `use client`
- 解码 jwt payload 获取 role/unitId
- `useEffect`：若无 token 跳 `/login`
- 拉取 units：`GET /meta/units`（auth:false）

- [ ] **Step 2: State model**

页面 state：
- `year`（string，默认当前年）
- `unitId`（number|null；保种场固定为 payload.unitId；管理单位可下拉；测定中心也可下拉但只读）
- `data`（Record<string, any>，按字段字典初始化）
- `warnings: string[]`
- `error: string | null`
- `busy: boolean`

- [ ] **Step 3: Fetch record**

当 `year/unitId` 变化时：
- GET `/base-info?year=...&unitId=...`
- 若返回 null：清空为默认 data
- 若返回 record：填充 data 与 fillDate

- [ ] **Step 4: Render form**

按 3 个区块渲染 inputs：
- 文本：`<input className="h-10 rounded-md border px-3" .../>`
- 数值：`type="number" step="any"`（提交前转 number/null）
- level：select（国家级/省级/其他）
- fillDate：`type="date"`（保存时写入 data.fillDate）

测定中心：全只读（inputs disabled，隐藏保存按钮）

- [ ] **Step 5: Save**

点击保存：
- PUT `/base-info?year=...&unitId=...` body `{ data }`
- 成功：显示 warnings（服务端返回），并刷新 GET 结果
- 401：清 token 并跳 `/login`（复用 excel 页面 handle401 逻辑）

---

## Task 5: Frontend — add entry in /pigs

**Files:**
- Modify: [pigs/page.tsx](file:///workspace/apps/web/src/app/pigs/page.tsx)

- [ ] **Step 1: Add link**

在页面顶部操作区增加：

```tsx
<Link className="text-blue-600 hover:underline" href="/base-info">
  基本信息(年度)
</Link>
```

---

## Task 6: Full verification

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

