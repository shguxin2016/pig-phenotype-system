# Task 8：猪肉品质模块设计（NY/T 821-2019 + NY/T 1180-2006）

## 1. 范围与目标

实现猪肉品质（MeatQuality）模块的后端接口、校验与结果评判提示，并提供前端单页分组录入页。

## 2. 数据模型

使用现有实体：[meat-quality.entity.ts](file:///workspace/apps/api/src/db/entities/meat-quality.entity.ts)

- 每猪最多一条：实体已存在 `@Index(['pigId'], { unique: true })`
- 与猪只关系：`pigId`

## 3. 接口设计（per-pig）

与 Growth / Repro / Carcass 一致，挂在 `pigs/:pigId/<domain>`。

- `GET /pigs/:pigId/meatq`
  - 不存在返回 null
  - 存在返回 `{ record, warnings }`
- `PUT /pigs/:pigId/meatq`
  - Upsert
  - 保存前做标准化、校验，并生成 `warnings`
  - 返回 `{ record, warnings }`

## 4. 权限

沿用系统统一策略（由 Service 内 `requirePig` 校验）：

- 保种场：仅能访问/写入本单位猪只
- 测定中心、管理单位：可访问/写入所有猪只

## 5. 校验与结果评判（NY/T 821-2019）

### 5.1 强校验（阻止保存）

基础格式/范围校验（用于数据质量）：

- pH：
  - `ph1h`、`ph24h` 必须为有限数值，且 `(0, 14]`
- 百分比类（0~100）：
  - `dripLossPct`、`waterHoldingPct`、`imfPct`、`impPct`、`moisturePct`、`cookedMeatRate`
- 评分法（允许 0.5 分档；存储 float）：
  - `colorScore`、`marblingScore` 范围 `[1, 6]`
- 其余数值项：
  - `colorL`/`colorA`/`colorB`：必须为有限数值（a*/b*是否允许负值先不额外限制）
  - `tendernessShearN`：必须为有限数值且 ≥ 0（单位 N）

### 5.2 结果评判（仅提示 warnings，不阻断保存）

按 NY/T 821 的“结果评判”输出提示性结论（可多条）：

- 肉色（5.1.3）基于 `colorL`：
  - `L >= 60` → PSE（肉色）
  - `53 <= L <= 59` → 趋近PSE（肉色）
  - `37 <= L <= 52` → 正常（肉色）
  - `31 <= L <= 36` → 趋近DFD（肉色）
  - `L <= 30` → DFD（肉色）
- pH（5.2.3）：
  - `ph1h < 5.9 OR ph24h < 5.6` → PSE（pH）
  - `ph1h > 6.5 OR ph24h > 6.0` → DFD（pH）
  - 否则 → 正常（pH）
- 滴水损失（5.3.4）：
  - `1.5% <= dripLossPct <= 5.0%` → 正常（滴水损失）
  - `dripLossPct > 5.0%` → PSE（滴水损失）
  - `dripLossPct < 1.5%` → DFD（滴水损失）
- 大理石纹（5.5.5）：按分值提示“对应肌内脂肪约值”（提示性，不强校验）

## 6. 前端页面（A 单页分组）

新增 ` /pigs/:pigId/meatq` 页面（从猪只详情页进入）：

- 顶部：猪只基本信息（耳标号、个体号、出生日期）
- 单页分块（建议）：
  - 肉色：评分/色差（colorScore、L/a/b）
  - pH：ph1h、ph24h
  - 系水力/滴水损失：waterHoldingPct、dripLossPct
  - 脂肪/水分：marblingScore、imfPct、impPct、moisturePct
  - 嫩度/熟肉率：tendernessShearN、cookedMeatRate
  - 备注
  - 结果评判（只读 warnings）
- 401 自动跳转登录
- 400/422 表单错误提示

## 7. 测试

后端：
- 保存一条 meatq 记录后，验证 warnings 输出符合 NY/T 821（L、pH、滴水损失）
- 权限测试：保种场用户不能访问其它单位猪只

前端：
- Next build 通过

