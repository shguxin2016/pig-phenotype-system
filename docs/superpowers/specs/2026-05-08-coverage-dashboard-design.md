# Task 11：统计总览（数据完整性/覆盖率）设计

## 1. 范围与目标

第一版实现“数据完整性/缺失项（覆盖率）”统计总览：

- 统计粒度：单位 × 品种
- 覆盖率分母：以猪只档案为分母（先统一用档案数，后续再细化模块独立分母）
- 展示形式：表格为主（第一版做“行=单位×品种”，后续再补二维矩阵视图）

## 2. 指标定义

### 2.1 分母

对每个 `(unitId, breedId)` 组：

- `registryCount` = PigEntity 数量

### 2.2 分子（各模块已录入数量）

对每个 `(unitId, breedId)` 组：

- `growthCount` = 有 GrowthTestEntity 记录的猪只数（按 pigId 唯一存在即计入）
- `reproCount` = 有 ReproPigletEntity 记录的猪只数（按 pigId 唯一存在即计入）
- `carcassCount` = 有 CarcassTraitEntity 记录的猪只数（按 pigId 唯一存在即计入）
- `meatqCount` = 有 MeatQualityEntity 记录的猪只数（按 pigId 唯一存在即计入）

### 2.3 覆盖率

当 `registryCount > 0`：

- `growthCoveragePct = growthCount / registryCount * 100`
- `reproCoveragePct = reproCount / registryCount * 100`
- `carcassCoveragePct = carcassCount / registryCount * 100`
- `meatqCoveragePct = meatqCount / registryCount * 100`

当 `registryCount = 0`：覆盖率为空或按 0 处理（建议为空，避免误解）。

## 3. 权限与数据范围

- 保种场：只能看到本单位的覆盖率统计（unitId = user.unitId）
- 测定中心：全量只读（可查看所有单位）
- 管理单位：全量可查看（可查看所有单位）

## 4. API 设计

新增统计模块 `stats`，第一版只做覆盖率接口：

### 4.1 覆盖率总表

`GET /stats/coverage?unitId=<optional>&breedId=<optional>`

- 权限：
  - 保种场：忽略 unitId，强制自身 unitId
  - 测定中心/管理单位：可选 unitId/breedId 过滤；不传表示全量
- 返回：

```ts
type CoverageRow = {
  unitId: number
  unitName: string
  breedId: number
  breedName: string
  registryCount: number
  growthCount: number
  reproCount: number
  carcassCount: number
  meatqCount: number
}

type CoverageResponse = {
  rows: CoverageRow[]
  totals: {
    registryCount: number
    growthCount: number
    reproCount: number
    carcassCount: number
    meatqCount: number
  }
}
```

前端根据 `rows` 计算百分比并渲染（也可后端直接返回 pct；第一版建议后端返回 count，避免百分比口径后续调整时改动接口）。

## 5. SQL/实现要点

为减少 N+1，建议在服务端用聚合查询一次性拿齐：

- 基表：PigEntity（按 unitId, breedId group by）
- left join 各模块表（按 pigId）
- 使用 `COUNT(DISTINCT ...)` 统计各模块有记录的 pig 数量

示例（概念）：

- registryCount: `COUNT(p.id)`
- growthCount: `COUNT(DISTINCT g.pig_id)`
- reproCount: `COUNT(DISTINCT rp.pig_id)`
- carcassCount: `COUNT(DISTINCT c.pig_id)`
- meatqCount: `COUNT(DISTINCT m.pig_id)`

并 join UnitEntity、BreedEntity 回填名称。

## 6. 前端页面

新增页面：`/stats/coverage`

- 筛选：
  - unit（管理单位/测定中心可选；保种场隐藏）
  - breed（所有角色可选）
- 表格（行=单位×品种）列：
  - 单位、品种、档案数
  - 生长覆盖率%、繁殖覆盖率%、胴体覆盖率%、肉质覆盖率%
  - 对应模块已录入数（可在百分比旁显示，如 `12/30`）
- 支持排序（按档案数或某模块覆盖率排序）

后续增强（第二版）：

- 增加二维矩阵视图（单位×品种）
- 增加“模块独立分母”（例如胴体以 slaughterDate 非空为分母等）

## 7. 测试

后端：

- 构造 2 个单位×2 个品种的猪只与部分模块记录
- 断言 coverage counts 聚合正确
- 断言保种场用户只能看到本单位数据

