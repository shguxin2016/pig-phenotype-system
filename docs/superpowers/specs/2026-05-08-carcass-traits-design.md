# Task 7：胴体性状模块设计（NY/T 825-2004）

## 1. 范围与目标

实现胴体性状模块的后端接口、校验与可计算指标，并提供前端单页分组录入页。

### 1.1 业务对象

- 测定猪只：以 pigId 关联
- 胴体性状记录：每头猪至多一条（已存在唯一约束）

### 1.2 权限

- 保种场：仅能访问/写入本单位猪只的胴体性状
- 测定中心、管理单位：可访问/写入所有猪只

## 2. 数据模型

使用现有实体：[carcass-trait.entity.ts](file:///workspace/apps/api/src/db/entities/carcass-trait.entity.ts)

### 2.1 字段分组（与前端一致）

- 基础：slaughterDate、preSlaughterWeightKg、carcassWeightLeftKg、carcassWeightRightKg、ribCount、remark
- 测量：carcassLengthCm、bodyObliqueLengthCm、backfatShoulderMm、backfatLastRibMm、backfatLumbarMm、skinThickness6_7RibMm、emaLastRibCm2、emaHeightCm、emaWidthCm
- 分割（左半胴体）：leftDetachSkinKg、leftDetachBoneKg、leftDetachFatKg、leftDetachLeanKg、leftLegWeightKg、hoofWeightKg、headWeightKg
- 自动计算（只读）：detachLossPct、legHipRatioPct、skinRatePct、boneRatePct、fatRatePct、leanRatePct、slaughterRatePct

## 3. 接口设计

### 3.1 读写接口（需登录 Bearer JWT）

- `GET /pigs/:pigId/carcass`
  - 返回该猪只胴体性状记录；若不存在返回 null
- `PUT /pigs/:pigId/carcass`
  - Upsert 胴体性状记录
  - 服务端在保存前完成字段标准化、逻辑校验、自动计算字段回填

## 4. 计算口径（NY/T 825-2004）

### 4.1 屠宰率（公式(1)）

- 胴体重 = carcassWeightLeftKg + carcassWeightRightKg
- slaughterRatePct = 胴体重 / preSlaughterWeightKg * 100

### 4.2 腿臀比例（公式(2)）

- legHipRatioPct = leftLegWeightKg / carcassWeightLeftKg * 100

### 4.3 皮/骨/肥/瘦率（公式(3)(4)(5)(6)）

上述四个“重”均为“左边胴体剥离后的称重”。

- leftDetachTotalKg = leftDetachSkinKg + leftDetachBoneKg + leftDetachFatKg + leftDetachLeanKg
- skinRatePct = leftDetachSkinKg / leftDetachTotalKg * 100
- boneRatePct = leftDetachBoneKg / leftDetachTotalKg * 100
- fatRatePct = leftDetachFatKg / leftDetachTotalKg * 100
- leanRatePct = leftDetachLeanKg / leftDetachTotalKg * 100

### 4.4 分割损耗（用于约束“损失不高于 2%”）

- detachLossPct = (carcassWeightLeftKg - leftDetachTotalKg) / carcassWeightLeftKg * 100
- 当 detachLossPct > 2 时：
  - 默认策略：返回 200 并保存，但在响应中附带 warnings（前端提示“超过 2%”）
  - 后续可升级为：管理单位可配置“提示/阻止保存”

## 5. 校验规则

### 5.1 格式校验

- 日期字段：YYYY-MM-DD
- 重量/长度/面积/厚度：数值且 ≥ 0
- 肋骨数 ribCount：整数且 ≥ 0

### 5.2 逻辑校验

当计算所需字段齐全时：

- leftDetachTotalKg ≤ carcassWeightLeftKg，否则报错（或至少给出强提示；默认报错）
- slaughterRatePct：若计算结果 ≤ 0 或 > 100，报错
- legHipRatioPct：若计算结果 ≤ 0 或 > 100，报错
- skin/bone/fat/lean 率：分母 leftDetachTotalKg 必须 > 0，否则这些率置空

## 6. 前端页面（A 单页分组）

新增 ` /pigs/:pigId/carcass` 页面（从猪只详情页进入）：

- 顶部：猪只基本信息（耳标号、个体号、出生日期）
- 单页分块：
  - 基础
  - 测量
  - 分割（左半胴体）
  - 自动计算（只读）
- 保存成功后刷新展示自动计算结果
- 401 自动跳转登录
- 422/400 表单错误提示；409 资源冲突提示（保留）

## 7. 测试

后端：
- 接口级测试：保存一条胴体记录后，校验屠宰率/腿臀比/皮骨肥瘦率/分割损耗计算正确
- 权限测试：保种场用户不能访问其它单位猪只

前端：
- 构建通过（Next build）

