# Excel Import/Export (Per-Module Templates) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现按模块的 Excel 模板下载、数据导出、数据导入（validate/commit 两阶段 + 批次记录 + 错误明细可下载），覆盖档案与全部测定模块，并满足既定权限与冲突策略。

**Architecture:** 后端引入 Excel 读写库（exceljs），新增 excel 模块与一组“模块适配器（schema + 解析/校验/写入/导出）”。导入分 validate/commit：validate 解析 Excel→生成 batch + errors + payloadJson；commit 使用 payloadJson 事务写入；错误明细由 batch 动态生成文件。前端新增 Excel 管理页面：模板下载/导出/导入预校验/错误下载/确认写入。

**Tech Stack:** NestJS + TypeORM + multer（文件上传）+ exceljs；Next.js App Router。

---

## File Map

**Backend (NestJS)**
- Add dep: `/workspace/apps/api/package.json`（exceljs）
- Create: `/workspace/apps/api/src/excel/excel.module.ts`
- Create: `/workspace/apps/api/src/excel/excel.controller.ts`
- Create: `/workspace/apps/api/src/excel/excel.service.ts`
- Create: `/workspace/apps/api/src/excel/excel.types.ts`
- Create: `/workspace/apps/api/src/excel/adapters/`（每模块适配器）
  - Create: `/workspace/apps/api/src/excel/adapters/pigs.adapter.ts`
  - Create: `/workspace/apps/api/src/excel/adapters/growth.adapter.ts`
  - Create: `/workspace/apps/api/src/excel/adapters/repro.adapter.ts`
  - Create: `/workspace/apps/api/src/excel/adapters/carcass.adapter.ts`
  - Create: `/workspace/apps/api/src/excel/adapters/meatq.adapter.ts`
  - Create: `/workspace/apps/api/src/excel/adapters/base-info.adapter.ts`
- Create: `/workspace/apps/api/src/db/entities/excel-import-batch.entity.ts`
- Create: `/workspace/apps/api/src/db/entities/excel-import-error.entity.ts`
- Modify: `/workspace/apps/api/src/db/entities/index.ts`（导出新实体）
- Modify: `/workspace/apps/api/src/db/typeorm-options.ts`（注册新实体）
- Modify: `/workspace/apps/api/src/app.module.ts`（注册 ExcelModule）
- Test: `/workspace/apps/api/src/excel/excel.controller.spec.ts`

**Frontend (Next.js)**
- Create: `/workspace/apps/web/src/app/excel/page.tsx`
- (Optional) Modify: `/workspace/apps/web/src/app/page.tsx`（首页入口）

---

## Task 1: Backend — Add entities & dependency

**Files:**
- Modify: `/workspace/apps/api/package.json`
- Create: `/workspace/apps/api/src/db/entities/excel-import-batch.entity.ts`
- Create: `/workspace/apps/api/src/db/entities/excel-import-error.entity.ts`
- Modify: `/workspace/apps/api/src/db/entities/index.ts`
- Modify: `/workspace/apps/api/src/db/typeorm-options.ts`

- [ ] **Step 1: Add dependency**

Modify `/workspace/apps/api/package.json` add:

```json
"exceljs": "^4.4.0"
```

Then run:

```bash
cd /workspace/apps/api
npm i
```

Expected: installs exceljs

- [ ] **Step 2: Add batch entity**

Create `/workspace/apps/api/src/db/entities/excel-import-batch.entity.ts`:

```ts
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

export type ExcelModuleName = 'pigs' | 'growth' | 'repro' | 'carcass' | 'meatq' | 'base_info'
export type ExcelImportStatus = 'validated' | 'committed' | 'failed'

@Entity({ name: 'excel_import_batch' })
@Index(['module', 'unitId', 'year', 'createdAt'])
export class ExcelImportBatchEntity {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'varchar' })
  module!: ExcelModuleName

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: string

  @Column({ type: 'int' })
  createdByUserId!: number

  @Column({ type: 'int' })
  unitId!: number

  @Column({ type: 'int', nullable: true })
  year!: number | null

  @Column({ type: 'varchar' })
  status!: ExcelImportStatus

  @Column({ type: 'int' })
  totalRows!: number

  @Column({ type: 'int' })
  validRows!: number

  @Column({ type: 'int' })
  errorRows!: number

  @Column({ type: 'int' })
  warningsCount!: number

  @Column({ type: 'simple-json' })
  payloadJson!: Record<string, unknown>
}
```

- [ ] **Step 3: Add error entity**

Create `/workspace/apps/api/src/db/entities/excel-import-error.entity.ts`:

```ts
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

@Entity({ name: 'excel_import_error' })
@Index(['batchId'])
export class ExcelImportErrorEntity {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'int' })
  batchId!: number

  @Column({ type: 'int' })
  rowNo!: number

  @Column({ type: 'varchar' })
  field!: string

  @Column({ type: 'text' })
  message!: string
}
```

- [ ] **Step 4: Register entities**

Modify `/workspace/apps/api/src/db/entities/index.ts` to export `ExcelImportBatchEntity` & `ExcelImportErrorEntity`.

Modify `/workspace/apps/api/src/db/typeorm-options.ts` to include them in `entities`.

- [ ] **Step 5: Run tests/build**

Run:

```bash
cd /workspace/apps/api
npm test -- --runInBand
npm run build
```

Expected: PASS

---

## Task 2: Backend — Excel module + controller endpoints

**Files:**
- Create: `/workspace/apps/api/src/excel/excel.module.ts`
- Create: `/workspace/apps/api/src/excel/excel.controller.ts`
- Create: `/workspace/apps/api/src/excel/excel.service.ts`
- Create: `/workspace/apps/api/src/excel/excel.types.ts`
- Create: `/workspace/apps/api/src/excel/adapters/*.ts`
- Modify: `/workspace/apps/api/src/app.module.ts`

- [ ] **Step 1: Add module**

Create `/workspace/apps/api/src/excel/excel.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import {
  BreedEntity,
  CarcassTraitEntity,
  ConservationBaseInfoEntity,
  ExcelImportBatchEntity,
  ExcelImportErrorEntity,
  GrowthTestEntity,
  MeatQualityEntity,
  PigEntity,
  ReproLitterEntity,
  ReproPigletEntity,
  UnitEntity
} from '../db/entities'
import { ExcelController } from './excel.controller'
import { ExcelService } from './excel.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExcelImportBatchEntity,
      ExcelImportErrorEntity,
      PigEntity,
      UnitEntity,
      BreedEntity,
      GrowthTestEntity,
      ReproLitterEntity,
      ReproPigletEntity,
      CarcassTraitEntity,
      MeatQualityEntity,
      ConservationBaseInfoEntity
    ])
  ],
  controllers: [ExcelController],
  providers: [ExcelService]
})
export class ExcelModule {}
```

- [ ] **Step 2: Register module in app.module.ts**

Add `ExcelModule` import and include in `imports`.

- [ ] **Step 3: Define controller**

Create `/workspace/apps/api/src/excel/excel.controller.ts`:

Routes:
- `GET /excel/templates/:module`
- `GET /excel/exports/:module?unitId=...&year=...`
- `POST /excel/imports/:module/validate?unitId=...&year=...` (multipart file; admin only)
- `POST /excel/imports/:module/commit` body `{ batchId }` (admin only)
- `GET /excel/imports/:batchId/errors`

Implementation skeleton:

```ts
import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import type { JwtPayload } from '../auth/auth.types'
import { ExcelService } from './excel.service'

@UseGuards(JwtAuthGuard)
@Controller('excel')
export class ExcelController {
  constructor(private readonly excel: ExcelService) {}

  @Get('templates/:module')
  async template(@Req() req: { user: JwtPayload }, @Param('module') module: string, @Res() res: Response) {
    const { filename, buffer } = await this.excel.generateTemplate(req.user, module)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
    return res.send(buffer)
  }

  @Get('exports/:module')
  async export(@Req() req: { user: JwtPayload }, @Param('module') module: string, @Query('unitId') unitId?: string, @Query('year') year?: string, @Res() res: Response) {
    const { filename, buffer } = await this.excel.exportData(req.user, module, unitId, year)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
    return res.send(buffer)
  }

  @Post('imports/:module/validate')
  @UseInterceptors(FileInterceptor('file'))
  async validate(
    @Req() req: { user: JwtPayload },
    @Param('module') module: string,
    @Query('unitId') unitId?: string,
    @Query('year') year?: string,
    @UploadedFile() file?: Express.Multer.File
  ) {
    if (!file) throw new BadRequestException('file必填')
    return this.excel.validateImport(req.user, module, unitId, year, file.buffer)
  }

  @Post('imports/:module/commit')
  async commit(@Req() req: { user: JwtPayload }, @Param('module') module: string, @Body() body: any) {
    return this.excel.commitImport(req.user, module, body)
  }

  @Get('imports/:batchId/errors')
  async downloadErrors(@Req() req: { user: JwtPayload }, @Param('batchId') batchId: string, @Res() res: Response) {
    const { filename, buffer } = await this.excel.exportErrors(req.user, batchId)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
    return res.send(buffer)
  }
}
```

- [ ] **Step 4: Implement ExcelService**

Create `/workspace/apps/api/src/excel/excel.service.ts` with:
- module validation & role checks
- adapter registry for each module
- `generateTemplate()`, `exportData()`, `validateImport()`, `commitImport()`, `exportErrors()`
- validateImport:
  - admin-only
  - parse workbook → rows
  - adapter.validateRows(...) returns `{ payload, errors, warnings, summary }`
  - persist batch + errors
  - return `{ batchId, summary, errors, warnings }`
- commitImport:
  - admin-only
  - load batch + errors; if errors>0 => 400
  - adapter.commit(payload, ...) inside `dataSource.transaction(...)`
  - mark batch committed
- exportErrors:
  - role-based access: admin can fetch any; non-admin can fetch only their unit? (safe default: only creator or admin)
  - generate xlsx from error list

- [ ] **Step 5: Add adapters (minimal skeleton)**

Each adapter provides:
- `moduleName`
- `headers` (column definitions: key, title, type, required)
- `parseRow(row)` → typed row + cell-level errors
- `validateBusiness(rows, context)` → errors/warnings/payload
- `commit(payload, txManager, context)` → writes
- `exportData(context)` → rows for export

Start with one adapter (pigs) end-to-end, then clone pattern to growth/repro/carcass/meatq/base_info.

- [ ] **Step 6: Run build**

Run:

```bash
cd /workspace/apps/api
npm run build
```

Expected: PASS

---

## Task 3: Backend — End-to-end test for one module (pigs)

**Files:**
- Test: `/workspace/apps/api/src/excel/excel.controller.spec.ts`

- [ ] **Step 1: Write test that uploads a generated workbook**

Use exceljs in test to generate an in-memory xlsx matching pigs template, then:
- POST validate as admin
- assert batchId returned, errors empty
- POST commit, assert success
- verify pigs created via existing `/pigs?q=` endpoint or repository query

- [ ] **Step 2: Run tests**

Run:

```bash
cd /workspace/apps/api
npm test -- --runInBand
```

Expected: PASS

---

## Task 4: Frontend — Excel management page (admin-only import)

**Files:**
- Create: `/workspace/apps/web/src/app/excel/page.tsx`

- [ ] **Step 1: Page layout**

Sections:
- 模块选择（下拉）
- 模板下载按钮（GET /excel/templates/:module）
- 数据导出（unitId + year 输入；year 仅 base_info 显示）
- 导入（仅管理单位可见）：
  - file input + validate 按钮
  - 预校验结果：summary + 错误列表（分页/滚动）
  - 下载错误明细按钮（GET /excel/imports/:batchId/errors）
  - commit 按钮（errors=0 时可点）

- [ ] **Step 2: Run build**

Run:

```bash
cd /workspace/apps/web
npm run build
```

Expected: PASS

---

## Self-Review Checklist (plan)

- 覆盖 spec：模板/导出/导入两阶段/批次与错误明细/权限/冲突策略/base_info year 参数
- 先打通 pigs 端到端，再扩展其它模块 adapter
- 不保存原始上传文件，仅保存 payloadJson 与错误明细

---

## Delivery Order: Adapter-by-adapter milestones

为降低一次性覆盖全部模块的风险，建议按“可复用度/依赖关系/价值密度”逐模块交付（每步都包含：模板下载 + 导出 + validate + commit + 错误下载 + e2e）。

### Milestone 0: Excel 基座（必须先完成）

- [ ] 新增 excel_import_batch / excel_import_error 实体与注册
- [ ] 新增 `/excel/templates/*`、`/excel/exports/*`、`/excel/imports/*` 基础路由
- [ ] 完成 exceljs 读写与通用解析器（读取首行表头、按列名映射到 key、按行号产生错误）
- [ ] 完成 batch/payloadJson 保存与 commit 事务框架
- [ ] 完成错误明细导出（xlsx/csv 任选其一，优先 xlsx）

### Milestone 1: pigs（猪只档案）— 基准模块（推荐第一个）

原因：所有模块都依赖猪只档案（ear_tag_no -> pigId），先打通该模块可复用“耳标解析/唯一校验/单位权限/品种映射”。

- [ ] pigs 模板（耳标号/个体号/品种/性别/出生日期/母猪耳号/备注）
- [ ] pigs 导出（unitId 过滤；导入仅管理单位；导出全角色按权限过滤）
- [ ] pigs 导入校验：
  - ear_tag_no 必填且全局唯一（与 DB 冲突报错）
  - breed_name 必须能映射到 breedId
  - sex 必须在集合内
  - birth_date 格式 YYYY-MM-DD
- [ ] pigs commit：批量插入 pig

### Milestone 2: growth（生长性能）— 单表 per-pig 模块（第二个）

原因：结构简单、每猪单条、可复用 per-pig upsert 校验/计算逻辑（复算 ADG/ADFI/FCR/DTSW 输出 warnings）。

- [ ] growth 模板（ear_tag_no + start/end/weight/feed/backfat/ema/remark）
- [ ] growth 导出（关联 pig.ear_tag_no）
- [ ] growth 导入校验：
  - ear_tag_no 必填且必须存在于 pig
  - 每猪单条：growth_test 已存在则报错
  - 日期/数值格式
- [ ] growth commit：批量写 growth_test，并调用现有 computeDerived 逻辑复算（或复用 GrowthService.upsert）

### Milestone 3: repro（繁殖性能）— 共享窝 + 个体（第三个）

原因：最复杂的冲突模型（同窝多行 + 窝级字段一致性），需要复用现有 ReproService 的窝共享规则。

- [ ] repro 模板（窝级字段 + ear_tag_no 个体字段）
- [ ] repro 导出（按 pig 关联输出，窝级字段重复）
- [ ] repro 导入校验：
  - 同窝（dam_ear_tag_no+farrowing_date）在同文件内窝级字段必须一致，否则错误
  - ear_tag_no 必须存在于 pig
  - 每猪单条：repro_piglet 已存在则报错
- [ ] repro commit：按行调用 ReproService.upsert（allowUpdateShared=true），并在 commit 事务内写入

### Milestone 4: carcass（胴体性状）— 单表 per-pig 模块（第四个）

原因：每猪单条、导入只需写基础/测量/分割字段，派生字段由 CarcassService 自动计算。

- [ ] carcass 模板（不含派生字段列）
- [ ] carcass 导出（含派生字段列）
- [ ] carcass 导入校验：
  - ear_tag_no 必须存在于 pig
  - carcass_trait 已存在则报错
  - left_detach_total <= carcass_weight_left 逻辑校验（复用 CarcassService）
- [ ] carcass commit：批量调用 CarcassService.upsert

### Milestone 5: meatq（猪肉品质）— 单表 per-pig 模块（第五个）

原因：每猪单条、强校验 + warnings 判定已在 MeatqService 中实现，导入可复用服务层逻辑。

- [ ] meatq 模板（不含 warnings）
- [ ] meatq 导出（原始字段 + 可选附加 warnings 文本列）
- [ ] meatq 导入校验：
  - ear_tag_no 必须存在于 pig
  - meat_quality 已存在则报错
  - 强校验（范围）复用 MeatqService
- [ ] meatq commit：批量调用 MeatqService.upsert

### Milestone 6: base_info（基本信息登记表）— 按年按单位（最后）

原因：键与其它模块不同（unitId+year），且你已确认“一次导入只针对一个 year”，适合最后落地为单独适配器。

- [ ] base_info 模板（不含 year 列；unitId 由导入参数指定）
- [ ] base_info 导出（unitId+year）
- [ ] base_info 导入校验：
  - year 参数必填且合理
  - (unitId, year) 已存在则报错
  - number 字段非负、level 枚举、fillDate 格式
- [ ] base_info commit：写入 ConservationBaseInfoEntity

