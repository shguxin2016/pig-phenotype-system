# Excel Import/Export — Milestone 3 (repro) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Excel 基座（已完成 pigs + growth）上补齐 repro（繁殖性能）模块的模板下载、导出、导入预校验、确认写入、错误明细下载，并新增 e2e 验证。

**Architecture:** 延续当前 `ExcelService` 的分支式实现（不引入 adapters 目录），通过 `ImportBatchEntity + ImportRowErrorEntity + payloadJson` 实现 validate/commit 两阶段；repro 的 payload 按“窝(dam_ear_tag_no+farrowing_date)”分组，commit 时事务内先写 litter 再写 piglet。

**Tech Stack:** NestJS + TypeORM + exceljs + jest/supertest e2e。

---

## Scope & Decisions (Locked)

- 方案：**方案 1（最小改动，ExcelService 内分支实现）**
- 冲突策略：
  - 数据库已有同窝（dam_ear_tag_no+farrowing_date）但窝级字段不一致：**validate 报错不写**
  - 数据库已有同窝但 `unitId` 与导入目标不一致：**validate 报错不写**
  - `repro_piglet` 已存在（pigId 唯一）：**validate 报错不写**
- 仍保留“共享窝”的业务语义：同窝多行必须窝级字段一致；写入后多猪 piglet 指向同一 litterId。

---

## File Map

**Backend**
- Modify: [excel.module.ts](file:///workspace/apps/api/src/excel/excel.module.ts)
- Modify: [excel.service.ts](file:///workspace/apps/api/src/excel/excel.service.ts)
- Add: [excel-repro-import.e2e-spec.ts](file:///workspace/apps/api/test/excel-repro-import.e2e-spec.ts)

---

## Task 1: Wire repositories & module routing for repro

**Files:**
- Modify: [excel.module.ts](file:///workspace/apps/api/src/excel/excel.module.ts)
- Modify: [excel.service.ts](file:///workspace/apps/api/src/excel/excel.service.ts)

- [ ] **Step 1: ExcelModule 注入 repro 实体**

在 `TypeOrmModule.forFeature([...])` 增加：

```ts
import { ReproLitterEntity, ReproPigletEntity } from '../db/entities'
// ...
ReproLitterEntity,
ReproPigletEntity,
```

- [ ] **Step 2: ExcelService constructor 注入 repo**

在构造函数中新增：

```ts
@InjectRepository(ReproLitterEntity)
private readonly reproLitters: Repository<ReproLitterEntity>,
@InjectRepository(ReproPigletEntity)
private readonly reproPiglets: Repository<ReproPigletEntity>,
```

- [ ] **Step 3: 扩展 module 枚举分支到 repro**

在 `assertModule()` 里加入：

```ts
if (module === 'repro') return 'repro'
```

并在以下入口分支加入 `repro`：

```ts
if (m === 'repro') return this.generateReproTemplate(user)
if (m === 'repro') return this.exportRepro(user, unitId)
if (m === 'repro') return this.validateRepro(user, unitId, year, filename, buffer)
if (m === 'repro') return this.commitRepro(m, body.batchId)
```

- [ ] **Step 4: Run typecheck/build**

Run:

```bash
cd /workspace/apps/api
npm run build
```

Expected: PASS

---

## Task 2: Implement repro template + export

**Files:**
- Modify: [excel.service.ts](file:///workspace/apps/api/src/excel/excel.service.ts)

- [ ] **Step 1: 模板生成 generateReproTemplate()**

输出 sheet 名 `repro`，表头列（首行）：

```ts
[
  '耳标号 ear_tag_no',
  '母猪耳号 dam_ear_tag_no',
  '分娩日期 farrowing_date',
  '配种日期 mating_date',
  '公猪耳号 boar_ear_tag_no',
  '胎次 parity',
  '公仔数 male_born',
  '母仔数 female_born',
  '死胎数 stillborn_count',
  '木乃伊胎数 mummy_count',
  '畸形数 malformed_count',
  '弱仔数 weak_count',
  '断奶日期 wean_date',
  '断奶仔猪数 wean_count',
  '断奶窝重 wean_litter_weight_kg',
  '窝备注 remark',
  '初生重 birth_weight_kg',
  '左乳头数 left_teats',
  '右乳头数 right_teats',
  '断奶重 wean_weight_ind_kg',
  '个体备注 piglet_remark',
]
```

- [ ] **Step 2: 导出 exportRepro()**

查询维度：按 `PigEntity.unitId = resolvedUnitId` 过滤，联结：

- `ReproPigletEntity rp`
- join `PigEntity p` on `p.id = rp.pigId`
- join `ReproLitterEntity l` on `l.id = rp.litterId`

导出每行包含：
- `ear_tag_no` 从 pig.earTagNo
- 窝级字段来自 litter
- piglet 字段来自 repro_piglet
- 可附加导出 `total_born/live_count`（可选；若加，导入忽略）

Run:

```bash
cd /workspace/apps/api
npm test -- --runInBand
```

Expected: PASS

---

## Task 3: Implement repro validate (group-by litter) + payloadJson

**Files:**
- Modify: [excel.service.ts](file:///workspace/apps/api/src/excel/excel.service.ts)

- [ ] **Step 1: 定义 payload 结构（按窝分组）**

在 `excel.service.ts` 增加 types（示例）：

```ts
type ReproPigletRow = {
  pigId: number
  birthWeightKg: number | null
  leftTeats: number | null
  rightTeats: number | null
  weanWeightIndKg: number | null
  remark: string | null
}

type ReproLitterGroup = {
  damEarTagNo: string
  farrowingDate: string
  litter: {
    boarEarTagNo: string | null
    matingDate: string | null
    parity: number | null
    maleBorn: number | null
    femaleBorn: number | null
    stillbornCount: number | null
    mummyCount: number | null
    malformedCount: number | null
    weakCount: number | null
    weanDate: string | null
    weanCount: number | null
    weanLitterWeightKg: number | null
    remark: string | null
  }
  computed: {
    totalBorn: number | null
    liveCount: number | null
  }
  piglets: ReproPigletRow[]
}

type ReproPayload = { groups: ReproLitterGroup[] }
```

- [ ] **Step 2: 表头映射 + 行级解析**

使用 `mapHeaders()` 兼容中文/英文/key（沿用 pigs/growth 的风格）。required：
- `ear_tag_no`
- `dam_ear_tag_no`
- `farrowing_date`

行级解析规则：
- 空行（所有列空）跳过
- date：`parseDateOrNull()`；格式非法 -> errors（field 对应列名）
- int：新增 `parseIntCell()`；非法 -> errors
- float：复用 `parseNumberCell()`；非法 -> errors
- string：trim，空串 -> null

- [ ] **Step 3: 文件内一致性校验**

校验点：
- `ear_tag_no` 文件内重复 -> errors
- 按 `(dam_ear_tag_no, farrowing_date)` 分组：
  - 同组的窝级字段必须一致；若不一致，对冲突行报错：
    - `field = 'dam_ear_tag_no'` 或 `field = null`
    - `message = '同一窝窝级字段不一致'`

- [ ] **Step 4: 数据库校验**

导入参数 `unitId` 必填；对于每行：
- pig 必须存在且 `pig.unitId == unitId`；否则 `message = '耳标号不存在或不属于该单位'`
- piglet 已存在（`repro_piglet` unique pigId）：`message = 'repro记录已存在'`

对于每个窝：
- 查询已有 litter（按 `damEarTagNo + farrowingDate`）：
  - 若存在且 `litter.unitId != unitId`：errors（`message = '同一窝已存在但所属单位不一致'`）
  - 若存在且窝级字段与导入不一致：errors（`message = '同一窝已存在但窝级字段冲突'`）

窝级字段冲突比较集合与 [repro.service.ts](file:///workspace/apps/api/src/repro/repro.service.ts) `diffLitter()` 保持一致（boarEarTagNo/matingDate/parity/maleBorn/femaleBorn/stillbornCount/mummyCount/malformedCount/weakCount/weanDate/weanCount/weanLitterWeightKg/remark），并在 validate 阶段先按规则计算：
- `totalBorn = maleBorn + femaleBorn`（两者都非空时）
- `liveCount = totalBorn - stillborn - mummy - malformed`（相关都非空时）
- 强校验：`weakCount <= liveCount`（否则 errors，消息与 service 一致：`弱仔数不能大于活仔数`）

- [ ] **Step 5: 保存 batch + errors + payloadJson**

与 pigs/growth 一致：
- batch 表存 `{ module: 'repro', unitId, status: 'validated', payloadJson }`
- errors 明细写入 `import_row_error`
- 返回 `{ batchId, summary, errors, warnings: [] }`

- [ ] **Step 6: Run unit tests**

Run:

```bash
cd /workspace/apps/api
npm test -- --runInBand
```

Expected: PASS

---

## Task 4: Implement repro commit (transaction)

**Files:**
- Modify: [excel.service.ts](file:///workspace/apps/api/src/excel/excel.service.ts)

- [ ] **Step 1: commitRepro() 验证 batch 状态与 errorCount**

与 pigs/growth 一致：
- batch 存在且 module 匹配
- status 必须 validated
- errorCount > 0 => 400（`存在错误，无法提交`）
- payloadJson 必须符合 `ReproPayload`

- [ ] **Step 2: 事务内写入**

在 `manager.transaction(async (manager) => ...)` 内：
- 对每个 group：
  - 先查 litter 是否已存在（dam+farrowing）
  - 若存在：再次校验 `unitId` 一致、窝级字段一致（避免 validate/commit 间并发插入导致的不一致）；不一致则 throw
  - 若不存在：insert litter（写入 unitId + 输入窝级字段 + computed totalBorn/liveCount）
  - 对 group.piglets：批量 insert `repro_piglet`（pigId 唯一，冲突则失败）
- 更新 batch.status = committed

catch 分支：
- batch.status = failed
- UNIQUE => `提交失败：唯一键冲突`，否则 `提交失败`

- [ ] **Step 3: Run build**

Run:

```bash
cd /workspace/apps/api
npm run build
```

Expected: PASS

---

## Task 5: Add repro e2e test

**Files:**
- Add: [excel-repro-import.e2e-spec.ts](file:///workspace/apps/api/test/excel-repro-import.e2e-spec.ts)

- [ ] **Step 1: 新增 e2e 测试文件**

测试用例覆盖：
- 先用 pigs Excel 导入创建 2 头猪（同 unitId=1）
- 构造 repro xlsx 两行：
  - 同一窝（同 dam_ear_tag_no + farrowing_date）
  - 两行窝级字段一致
  - 两行分别填写各自 piglet 字段
- validate（`/excel/imports/repro/validate?unitId=1`）=> errorRows=0
- commit（`/excel/imports/repro/commit`）=> ok=true
- 逐头猪 GET `/pigs/:pigId/repro`：
  - 返回 `{ litter, piglet }`
  - 两头猪的 `litter.id` 相同（共享窝）

- [ ] **Step 2: Run e2e**

Run:

```bash
cd /workspace/apps/api
npm run test:e2e -- --runInBand
```

Expected: PASS（包含 pigs/growth/repro 三个 Excel e2e）

---

## Task 6: Full verification

- [ ] **Step 1: api 单测 + 构建 + e2e**

Run:

```bash
cd /workspace/apps/api
npm test -- --runInBand
npm run build
npm run test:e2e -- --runInBand
```

Expected: PASS

- [ ] **Step 2: web 构建回归**

Run:

```bash
cd /workspace/apps/web
npm run build
```

Expected: PASS

