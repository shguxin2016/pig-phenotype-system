# Task 10：Excel 导入导出设计（按模块模板）

## 1. 范围与目标

实现 Excel 的“模板下载 / 数据导出 / 数据导入（预校验 + 批次记录 + 错误明细可下载 + 确认写入）”。

约束（已确认）：

- 覆盖模块：猪只档案、生长性能、繁殖性能（窝级+个体）、胴体性状、猪肉品质、保种场基本信息登记表
- 模板形式：按模块单独文件（一个模块一个 xlsx）
- 冲突策略：默认“报错不写”（不做覆盖更新）
- 预校验呈现：页面列表 + 可下载错误明细文件；保存导入批次记录
- 原始上传文件：不留存
- 权限：
  - 导出：全角色可用（按各自数据权限过滤）
  - 导入：仅管理单位可用
- 基本信息登记表导入：一次导入只针对一个 year（year 作为参数，模板内不放 year 列）
- 导出范围：按 unitId + year（基本信息必须带 year；其它模块以 unitId 为主，可扩展）

## 2. 总体架构

后端负责：

- 生成模板与导出数据 xlsx
- 解析上传 xlsx
- 执行预校验（格式、必填、唯一键、逻辑校验、可计算字段复算）
- 生成错误明细与 warnings
- 写入确认（commit）阶段采用事务：要么全部成功写入，要么全部回滚

前端负责：

- 模块选择、下载模板/导出文件
- 上传 xlsx 触发 validate
- 展示预校验结果（汇总 + 错误明细列表）
- 下载错误明细文件
- 对无错误批次执行 commit

## 3. 批次记录与错误明细

### 3.1 ImportBatch（导入批次）

建议新增表 `excel_import_batch`：

- id
- module（枚举：pigs/growth/repro/carcass/meatq/base_info）
- created_at
- created_by_user_id
- unit_id（导入目标单位）
- year（仅 base_info 使用）
- status（validated / committed / failed）
- total_rows
- valid_rows
- error_rows
- warnings_count

### 3.2 ImportError（错误明细）

建议新增表 `excel_import_error`（与 batch 一对多）：

- id
- batch_id
- row_no（Excel 行号，从 2 开始）
- field（字段 key）
- message（原因）

错误明细下载（xlsx/csv）由服务端按 batch_id 动态生成，不需要保存文件。

## 4. 接口设计

### 4.1 模板下载（空模板）

`GET /excel/templates/:module`

- module ∈ pigs | growth | repro | carcass | meatq | base_info
- 返回 xlsx 文件流

### 4.2 数据导出（带数据）

`GET /excel/exports/:module?unitId=...&year=...`

- 权限：
  - 保种场：unitId 强制为自身单位
  - 测定中心：允许 unitId
  - 管理单位：允许任意 unitId
- year：
  - base_info 必填
  - 其它模块忽略

### 4.3 导入预校验

`POST /excel/imports/:module/validate?unitId=...&year=...`

- 权限：仅管理单位
- unitId：必填（导入目标单位）
- year：仅 base_info 必填
- body：multipart/form-data（file）

返回：

- `{ batchId, summary, errors: [...], warnings: [...] }`

其中：

- summary：总行数、通过行数、错误行数
- errors：行号/字段/原因（前端用于展示）
- warnings：提示性信息（如复算结果与录入不一致、损耗>2%、PSE/DFD 判定等）

### 4.4 导入确认写入

`POST /excel/imports/:module/commit`

body：

- `{ batchId }`

规则：

- 若 batch 仍存在 errors，则 400
- 以 batch 中缓存的“解析结果”写入数据库（为避免保存原始文件，需在 validate 阶段把解析后的数据 JSON 存在 batch 表中，例如 batch.payload_json）
- 写入采用事务；失败则 batch 标记 failed 并返回原因

### 4.5 错误明细下载

`GET /excel/imports/:batchId/errors`

- 返回 xlsx（或 csv）文件流，内容为错误列表（row_no、field、message）

## 5. 模板字段与键

### 5.1 通用约定

- 第一行为表头（中文列名）
- 第二行起为数据
- 所有模板统一包含 `耳标号 ear_tag_no` 作为关联键（base_info 例外）

### 5.2 猪只档案（pigs）

键：ear_tag_no（全局唯一）

字段（示例列名）：

- 耳标号 ear_tag_no（必填）
- 个体号 individual_no（可选）
- 品种 breed_name（必填，需能映射到 breedId）
- 单位 unit_name（导入时 unitId 由参数指定；导出时回填）
- 性别 sex（必填）
- 出生日期 birth_date（必填）
- 母猪耳号 dam_ear_tag_no（可选）

### 5.3 生长性能（growth）

键：ear_tag_no（每猪单条；已存在则报错）

字段：

- 耳标号 ear_tag_no（必填）
- 始测日期 start_date（可选但用于日龄计算）
- 始测体重 start_weight_kg
- 结测日期 end_date
- 结测体重 end_weight_kg
- 耗料 feed_kg
- 结测背膘 end_backfat_mm
- 结测眼肌面积 end_ema_cm2
- 备注 remark

可计算复算：

- ADG/ADFI/FCR/DTSW 由服务端复算；若与表中给出的值不一致（模板可不提供这些列），输出 warnings。

### 5.4 繁殖性能（repro）

同一窝可出现多行（多头测定猪只）。

窝级键：dam_ear_tag_no + farrowing_date

个体键：ear_tag_no（每猪单条 piglet 记录）

窝级字段（每行重复出现，必须一致）：

- 母猪耳号 dam_ear_tag_no（必填）
- 分娩日期 farrowing_date（必填）
- 配种日期 mating_date
- 公猪耳号 boar_ear_tag_no
- 胎次 parity
- 公仔数 male_born
- 母仔数 female_born
- 死胎数 stillborn_count
- 木乃伊胎数 mummy_count
- 畸形数 malformed_count
- 弱仔数 weak_count
- 断奶日期 wean_date
- 断奶仔猪数 wean_count
- 断奶窝重 wean_litter_weight_kg

个体字段（每行对应该 ear_tag_no）：

- 初生重 birth_weight_kg
- 左乳头数 left_teats
- 右乳头数 right_teats
- 断奶重 wean_weight_ind_kg

冲突策略：

- 同窝已存在：允许关联并写入该猪只个体字段
- 同窝窝级字段不一致：报冲突错误（errors）

### 5.5 胴体性状（carcass）

键：ear_tag_no（每猪单条；已存在则报错）

字段：与当前接口一致（见 CarcassTrait）

复算：

- 屠宰率/腿臀比/皮骨肥瘦率/分割损耗由服务端复算，复算结果用于导出列；导入不要求提供这些列。

### 5.6 猪肉品质（meatq）

键：ear_tag_no（每猪单条；已存在则报错）

字段：与当前接口一致（见 MeatQuality）

复算/评判：

- PSE/DFD 等结果评判仅作为 warnings。

### 5.7 保种场基本信息登记表（base_info）

键：unitId + year（year 由导入参数指定；已存在则报错）

字段：采用 Task 9 字段字典（模板不含 year）

## 6. 依赖与库选择

后端需引入 xlsx 读写库（Node）：

- 推荐：exceljs（支持样式、写入方便）
- 备选：xlsx（sheetjs，读写快但样式较弱）

## 7. 测试策略

- 单元测试：模块级解析函数（给定二维数组/worksheet => rows）
- e2e：validate 返回错误明细；commit 对无错误批次写入成功；重复导入报错

