# Excel Import/Export — Milestone 6 (base_info) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Excel 基座（已完成 pigs + growth + repro + carcass + meatq）上补齐 base_info（年度基本信息登记表）模块的模板下载、导出、导入预校验、确认写入、错误明细下载，并新增 e2e 验证。

**Architecture:** 延续当前 `ExcelService` 分支式实现；base_info 记录是 `(unitId, year)` 唯一的一条表单，Excel 形态采用“单行宽表”：第 1 行表头，第 2 行数据。导入仍是 validate/commit 两阶段；冲突策略遵循 Excel 默认：若数据库已有同一 `(unitId,year)` 记录，则 validate 报错不写；`fill_date` 同时写入 `data.fillDate` 与实体列 `fillDate`。

**Tech Stack:** NestJS + TypeORM + exceljs + jest/supertest e2e。

---

## Locked Decisions

- 模板不含 `year` 列：`year` 通过 query 参数传入（前端 `/excel` 已在 `moduleName === 'base_info'` 时强制带 `year`）
- Excel 形态：单行宽表
- 导入权限：仅管理单位
- 冲突策略：`(unitId, year)` 已存在 => 报错不写

---

## Column Dictionary (data JSON keys)

字段来源：[2026-05-08-conservation-base-info-design.md](file:///workspace/docs/superpowers/specs/2026-05-08-conservation-base-info-design.md)

**基础信息**
- `name`
- `level`（国家级/省级/其他）
- `code`
- `address`
- `principal`
- `phone`
- `email`
- `farmCode`
- `technicianCount`
- `technicalPrincipal`
- `technicalTitleOrDegree`
- `protectedBreedName`

**群体规模（number）**
- `inStockCount`
- `familyCount`
- `breedingCount`
- `breedingMaleCount`
- `breedingFemaleBaseCount`
- `reserveCount`
- `reserveMaleCount`
- `reserveFemaleCount`

**资源与填报**
- `landAreaM2`
- `housingAreaM2`
- `fixedAssets10kCny`
- `filler`
- `contact`
- `fillDate`（YYYY-MM-DD，同步到实体列）

---

## File Map

**Backend**
- Modify: [excel.module.ts](file:///workspace/apps/api/src/excel/excel.module.ts)
- Modify: [excel.service.ts](file:///workspace/apps/api/src/excel/excel.service.ts)
- Add: [excel-base-info-import.e2e-spec.ts](file:///workspace/apps/api/test/excel-base-info-import.e2e-spec.ts)

---

## Task 1: Wire repositories & module routing for base_info

**Files:**
- Modify: [excel.module.ts](file:///workspace/apps/api/src/excel/excel.module.ts)
- Modify: [excel.service.ts](file:///workspace/apps/api/src/excel/excel.service.ts)

- [ ] **Step 1: ExcelModule 注入 ConservationBaseInfoEntity**

在 `TypeOrmModule.forFeature([...])` 增加：

```ts
import { ConservationBaseInfoEntity } from '../db/entities'
// ...
ConservationBaseInfoEntity,
```

- [ ] **Step 2: ExcelService constructor 注入 repo**

```ts
@InjectRepository(ConservationBaseInfoEntity)
private readonly baseInfo: Repository<ConservationBaseInfoEntity>,
```

- [ ] **Step 3: 扩展 assertModule 与入口分支**

加入 module `'base_info'` 并接入：

```ts
if (m === 'base_info') return this.generateBaseInfoTemplate(user)
if (m === 'base_info') return this.exportBaseInfo(user, unitId, year)
if (m === 'base_info') return this.validateBaseInfo(user, unitId, year, filename, buffer)
if (m === 'base_info') return this.commitBaseInfo(m, body.batchId)
```

---

## Task 2: Implement base_info template + export

**Files:**
- Modify: [excel.service.ts](file:///workspace/apps/api/src/excel/excel.service.ts)

- [ ] **Step 1: generateBaseInfoTemplate()**

Sheet name: `base_info`，表头列（第 1 行）按上面的 Column Dictionary 输出为：
`中文标题 + key`，示例：`名称 name`、`级别 level`、`存栏数量 inStockCount` ... `日期 fillDate`

- [ ] **Step 2: exportBaseInfo()**

路由：`GET /excel/exports/base_info?unitId=...&year=...`
- year 必填（validate/export 都必须）
- 保种场读：忽略 unitId，强制本单位（复用 `resolveUnitIdForRead`）
- 其它角色读：unitId 必填（复用现有逻辑）

查询：`ConservationBaseInfoEntity` 按 `(unitId, year)` 查单条
- 不存在：导出仅表头，无数据行
- 存在：导出表头 + 单行数据

并补充一列（可选）`record_id` 用于定位；导入忽略（若不加也可）。

---

## Task 3: Implement base_info validate + commit

**Files:**
- Modify: [excel.service.ts](file:///workspace/apps/api/src/excel/excel.service.ts)

- [ ] **Step 1: validateBaseInfo()**

输入约束：
- `unitId` 必填（导入目标单位）
- `year` 必填（整数范围建议 2000~2100）
- Excel 非空数据行只能有 1 行；若多于 1 行 => errors（`message = 'base_info 仅支持单行导入'`）

字段解析：
- string：trim，空串 -> null
- number：复用 `parseNumberCell`，必须有限且 >=0；否则 errors
- level：必须属于 `国家级/省级/其他`，否则 errors
- fillDate：YYYY-MM-DD（`parseDateOrNull`）

数据库校验：
- pig 不涉及；只查 `ConservationBaseInfoEntity` 是否已存在：
  - 存在 => errors（`message = 'base_info 记录已存在'`）

payloadJson：

```ts
type BaseInfoPayload = {
  unitId: number
  year: number
  data: Record<string, unknown>
  fillDate: string | null
}
```

保存 batch：`module='base_info'`、`year=resolvedYear`、`payloadJson` 为上面对象包装在 `{ row: ... }` 或 `{ rows:[...] }`（与现有批次结构保持一致即可）。

- [ ] **Step 2: commitBaseInfo()**

事务内：
- 再次检查 `(unitId,year)` 不存在（防 validate/commit 并发）
- insert `ConservationBaseInfoEntity`：
  - `unitId`
  - `year`
  - `data`（含 fillDate 字段）
  - `fillDate`（实体列）
- 更新 batch.status=committed

异常：唯一冲突 => `提交失败：唯一键冲突`，其它 => `提交失败`

---

## Task 4: Add base_info e2e

**Files:**
- Add: [excel-base-info-import.e2e-spec.ts](file:///workspace/apps/api/test/excel-base-info-import.e2e-spec.ts)

- [ ] **Step 1: e2e 用例**

流程：
- admin 登录
- 构造 base_info xlsx（单行）
- validate：`POST /excel/imports/base_info/validate?unitId=1&year=2026`
- commit：`POST /excel/imports/base_info/commit`
- 通过 `GET /excel/exports/base_info?unitId=1&year=2026` 下载导出 xlsx
- exceljs 解析导出文件，断言关键单元格（例如 name/level/inStockCount/fillDate）与导入一致

- [ ] **Step 2: Run e2e**

```bash
cd /workspace/apps/api
npm run test:e2e -- --runInBand
```

Expected: PASS（Excel e2e 含 pigs/growth/repro/carcass/meatq/base_info）

---

## Task 5: Full verification

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

