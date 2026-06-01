# Task 10（Excel 导入导出）下一步：Milestone 2 — growth（生长性能）适配

## Summary

在现有 Excel 基座（已完成 pigs 端到端）的基础上，继续实现 **Milestone 2：growth（生长性能）** 的模板下载、数据导出、导入预校验、确认写入（commit）、错误明细下载与 e2e 验证；并顺带修复 monorepo 安装依赖时 shared 包的 TypeScript 配置报错，以保证在全新环境下可跑通 build/test。

## Current State Analysis

### Excel 基座现状

- Excel 路由与权限已存在：[excel.controller.ts](file:///workspace/apps/api/src/excel/excel.controller.ts)
  - `GET /excel/templates/:module`
  - `GET /excel/exports/:module`
  - `POST /excel/imports/:module/validate`（管理单位）
  - `POST /excel/imports/:module/commit`（管理单位）
  - `GET /excel/imports/:batchId/errors`（管理单位）
- ExcelService 当前仅支持 `module === 'pigs'`，其它模块会返回“module不支持”：[excel.service.ts](file:///workspace/apps/api/src/excel/excel.service.ts#L57-L105)
- 导入批次与错误明细实体已落地：
  - [import-batch.entity.ts](file:///workspace/apps/api/src/db/entities/import-batch.entity.ts)
  - [import-row-error.entity.ts](file:///workspace/apps/api/src/db/entities/import-row-error.entity.ts)
- pigs 导入已具备 e2e 覆盖：[excel-pigs-import.e2e-spec.ts](file:///workspace/apps/api/test/excel-pigs-import.e2e-spec.ts)

### growth 领域现状

- per-pig 接口已存在：`GET/PUT /pigs/:pigId/growth`：[growth.controller.ts](file:///workspace/apps/api/src/growth/growth.controller.ts)
- GrowthService 会在 upsert 时计算派生字段（startAgeDays/endAgeDays/testDays/adgG/adfiKg/fcr/dtswDays）：[growth.service.ts](file:///workspace/apps/api/src/growth/growth.service.ts#L83-L150)
- growth 表结构（含派生字段列）：[growth-test.entity.ts](file:///workspace/apps/api/src/db/entities/growth-test.entity.ts)

### CI/依赖验证阻塞点（需要在本 milestone 顺手修复）

- 在全新环境执行 `npm ci` 时，`packages/shared` 的 `tsc -p tsconfig.json` 会因 `moduleResolution=node10` deprecation 报错而失败（工具输出建议添加 `ignoreDeprecations`）。
- shared tsconfig 位置：[shared/tsconfig.json](file:///workspace/packages/shared/tsconfig.json)

## Proposed Changes

### 0) 修复 shared 包 TypeScript 构建报错（为后续验证铺路）

**目标：** 让 `npm ci` 能顺利跑完 workspace 依赖安装与 `packages/shared` 的 `prepare/build`。

**文件：**
- 修改：[packages/shared/tsconfig.json](file:///workspace/packages/shared/tsconfig.json)

**变更：**
- 在 `compilerOptions` 增加 `ignoreDeprecations`（按编译器报错建议填写 `6.0`），以消除 TS5107 阻塞。

**验收：**
- `npm ci`（apps/api 与 apps/web）不再在 shared build 阶段失败。

---

### 1) 后端：ExcelModule 增加 growth 依赖注入

**目标：** ExcelService 能访问 GrowthTestEntity 及必要的 pig/breed 信息用于校验与写入。

**文件：**
- 修改：[excel.module.ts](file:///workspace/apps/api/src/excel/excel.module.ts)

**变更：**
- TypeOrmModule.forFeature 增加 `GrowthTestEntity`（以及后续里程碑可能用到的实体可分步加入；本 milestone 只加 growth 必需项）。

---

### 2) 后端：为 growth 实现模板/导出/validate/commit

**目标：** 让 `/excel/*/growth` 全链路可用，并遵循既定策略：
- 导入仅管理单位
- 导入目标必须带 `unitId` 参数
- 冲突策略：默认“报错不写”（growth_test 已存在则报错）

**文件：**
- 修改：[excel.service.ts](file:///workspace/apps/api/src/excel/excel.service.ts)

**接口行为（保持与 pigs 一致的返回结构）：**
- `GET /excel/templates/growth`
  - 返回 `growth-template.xlsx`
- `GET /excel/exports/growth?unitId=...`
  - 保种场角色：忽略传入 unitId，强制为自身 unitId（复用现有 `resolveUnitIdForRead`）
  - 其它角色：unitId 必填（复用现有逻辑）
- `POST /excel/imports/growth/validate?unitId=...`
  - 返回 `{ batchId, summary, errors, warnings }`
- `POST /excel/imports/growth/commit` body `{ batchId }`
  - errors>0 则 400
  - 成功返回 `{ ok: true, inserted }`

**growth 模板列（首行表头，中文+key 形式，尽量与 pigs 风格一致）：**
- 耳标号 ear_tag_no（必填）
- 始测日期 start_date（可选，YYYY-MM-DD）
- 始测体重 start_weight_kg（可选，number）
- 结测日期 end_date（可选，YYYY-MM-DD）
- 结测体重 end_weight_kg（可选，number）
- 耗料 feed_kg（可选，number）
- 结测背膘 end_backfat_mm（可选，number）
- 结测眼肌面积 end_ema_cm2（可选，number）
- 备注 remark（可选）

**导出列：**
- 导出时包含上述输入列；
- 额外追加派生列（便于查看结果）：`start_age_days/end_age_days/test_days/adg_g/adfi_kg/fcr/dtsw_days`
- 导入时忽略派生列（即使用户在文件中填了，也不参与写入），但可用于生成 warnings（见下）。

**validate 的校验规则：**
- 文件结构：
  - 第一张 sheet 读取
  - 表头映射使用 aliases（兼容“中文/英文/key”多种写法），缺少 `ear_tag_no` 直接 400
- 行级字段校验：
  - 识别空行（全空则跳过）
  - date：必须为 YYYY-MM-DD 或 Excel 日期序号/Date 类型（复用现有 `parseDateCell`）
  - number：必须能 parse 为有限数；否则报错
  - remark：trim 后空串 -> null
- 业务校验：
  - `ear_tag_no` 文件内重复：报错
  - `ear_tag_no` 必须存在于 pig，且 pig.unitId 必须等于 import 参数 unitId：否则报错
  - 对应 pig 的 growth_test 已存在：报错（保持“报错不写”）
- 派生计算与 warnings：
  - 参照 GrowthService 的计算口径计算派生字段（至少：startAgeDays/endAgeDays/testDays/adgG/adfiKg/fcr/dtswDays）
  - 若导入文件中存在派生列且与复算值不一致：输出 warnings（不阻断）
  - 若 testDays<=0、gain<=0 等导致派生为空：可输出 warnings（不阻断）

**payloadJson 结构：**
- `payloadJson = { rows: GrowthPayloadRow[] }`
- GrowthPayloadRow 推荐包含：
  - `pigId`
  - `startDate/startWeightKg/endDate/endWeightKg/feedKg/endBackfatMm/endEmaCm2/remark`
  - `startAgeDays/endAgeDays/testDays/adgG/adfiKg/fcr/dtswDays`（commit 直接写入）

**commit 写入策略：**
- 事务内批量 insert `growth_test`（chunk 写入，参考 pigs 的 200 行 chunk）
- 依赖 growth_test 的唯一索引 pigId；在 validate 已做存在性检查，commit 再遇唯一冲突时返回“提交失败：唯一键冲突”
- 成功后更新 batch.status = committed；异常更新为 failed

---

### 3) 后端：新增 growth 导入 e2e

**目标：** 覆盖 validate→commit→数据落库，确保与 pigs 一致的端到端可用性。

**文件：**
- 新增：`apps/api/test/excel-growth-import.e2e-spec.ts`

**用例：**
- admin 登录
- 先通过 pigs 导入或直接调用现有 pigs 创建接口创建一头 pig（更推荐复用 pigs 导入方式保证独立性）
- 生成 growth xlsx（内存 exceljs）→ validate（unitId=1）→ commit
- GET `/pigs?q=...` 拿 pigId 后，GET `/pigs/:pigId/growth` 验证记录存在且派生字段非空（在输入足够的情况下）

---

### 4) 前端：Excel 管理页无需改动（仅做回归验证）

**现状：**
- 前端已经提供模块下拉并支持模板下载/导出/导入流程：[excel/page.tsx](file:///workspace/apps/web/src/app/excel/page.tsx)

**本 milestone 目标：**
- 后端支持 growth 后，前端无需改动即可正常使用 growth 的模板/导出/导入。

## Assumptions & Decisions

- “继续推进下一步”按既定交付顺序解释为 **Task 10 Milestone 2：growth**。
- growth 导入仍坚持“默认不覆盖”：当 growth_test 已存在时在 validate 阶段报错并阻断 commit。
- 导出会额外带派生列以提升可用性；导入会忽略派生列但可对比生成 warnings。
- 为保证可验证性，把 `packages/shared` 的 TypeScript 构建报错修复纳入本 milestone（属于必要的工程性前置）。

## Verification Steps

### Backend
- 在全新依赖安装后执行：
  - `npm ci`（apps/api）
  - `npm --prefix apps/api test -- --runInBand`
  - `npm --prefix apps/api run build`
  - `npm --prefix apps/api run test:e2e -- --runInBand`（应包含 pigs + growth 两个 e2e）

### Frontend
- `npm ci`（apps/web）
- `npm --prefix apps/web run build`

### Manual Smoke（可选）
- 登录管理单位账号，进入 `/excel`
- 选择“生长性能”，下载模板、上传示例文件预校验、确认写入，再到猪只详情页查看 `/growth` 数据是否出现

