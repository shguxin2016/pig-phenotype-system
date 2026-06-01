# 上海市地方品种猪保种场表型测定记录管理系统（设计与规格草案）

版权：上海市动物疫病预防控制中心

## 1. 目标与范围

### 1.1 建设目标

- 支持 5 个保种场、1 个测定中心、1 个管理单位在统一系统内完成测定猪只档案建立、表型测定数据录入、校验与自动计算、Excel 导入导出，以及管理单位的数据汇总与统计。

### 1.2 范围内功能

- 用户登录与权限控制（用户名 + 用户单位 + 密码）。
- 账号管理（管理单位可管理各保种场与测定中心账号信息）。
- 固定单位与固定地方品种猪配置。
- 测定猪只档案管理（耳标号全系统唯一）。
- 生长性能、繁殖性能（母代窝记录）、胴体性状、猪肉品质记录管理。
- 保种场基本信息登记表模块（按年度维护，可导出）。
- Excel 导入导出与数据校验（按模块模板，“一个猪一行”）。

### 1.3 范围外（本期不强制）

- 审批流（录入→审核→发布）。
- 现场采集硬件/秤/测定仪自动对接。
- 多级组织/多账号细分岗位权限（本期每单位 1 个账号）。

## 2. 参与单位与权限

### 2.1 固定单位清单

- 保种场（5）
  - 上海市嘉定区动物疫病预防控制中心（梅山猪种猪场），负责人：甘叶青
  - 上海沙乌头农业科技有限公司（沙乌头猪种猪场），负责人：凡中坤
  - 上海浦汇良种繁育科技有限公司（浦东白猪保种场），负责人：张浩
  - 上海沁侬牧业科技有限公司（枫泾猪保种场），负责人：孙杰
  - 上海市农业科学院庄行综合试验站（上海白猪保种场），负责人：陆老师
- 测定中心（1）
  - 上海市种畜禽测定中心
- 管理单位（1）
  - 上海市动物疫病预防控制中心

### 2.2 角色与能力

- 保种场账号
  - 仅可新增/编辑/删除本单位测定猪只档案及其各模块记录。
  - 仅可导入/导出本单位数据。
- 测定中心账号
  - 可新增/编辑/删除 5 个保种场及测定中心范围内全部猪只与记录数据。
  - 可导入/导出全部数据。
- 管理单位账号
  - 最高权限。
  - 可导入保种场与测定中心数据文件进行汇总、统计管理。
  - 可全量查询与统计。
  - 可管理各保种场与测定中心账号信息（新增/停用/重置密码/修改用户名）。

### 2.3 账号开通与登录

- 账号由管理单位创建。
- 每单位 1 个账号。
- 登录使用：用户名 + 用户单位 + 密码。

## 3. 信息架构与核心流程

### 3.1 模块结构

- 首页/总览：本单位数据概览、最近导入、异常校验提示。
- 基础档案
  - 测定猪只档案
  - 保种场基本信息登记表（按年度）
- 测定记录
  - 生长性能
  - 繁殖性能（母代）
  - 胴体性状
  - 猪肉品质
- 数据管理
  - 账号管理（管理单位）
  - Excel 导入
  - Excel 导出
  - 导入批次与错误明细
- 统计分析（管理单位/测定中心）
  - 按单位/品种/时间范围统计

### 3.2 录入逻辑（先建档后录模块）

- Step 1：新建测定猪只档案（耳标号唯一校验）。
- Step 2：进入该猪只详情页（顶部固定显示基础信息）。
- Step 3：在猪只详情页中按页签录入：生长 / 繁殖（母代）/ 胴体 / 肉质。

## 4. 数据模型（实体、主键与关系）

本节描述逻辑数据模型，用于指导后续数据库表结构设计与 Excel 关联键设计。

### 4.1 基础实体

#### 4.1.1 Unit（单位）

- unit_id
- unit_name
- unit_type：保种场 / 测定中心 / 管理单位
- default_breed_id（保种场使用）

#### 4.1.2 Breed（品种）

- breed_id
- breed_name：梅山 / 沙乌头 / 浦东白 / 枫泾 / 上海白

#### 4.1.3 User（账号）

- user_id
- username
- unit_id
- role：保种场 / 测定中心 / 管理单位
- password_hash
- status

#### 4.1.4 Pig（测定猪只档案）

- pig_id（系统生成）
- unit_id（所属单位）
- breed_id
- individual_no（个体号）
- ear_tag_no（耳标号，全系统唯一）
- sex
- birth_date
- birth_weight_kg
- dam_ear_tag_no（母猪耳号，母代识别）
- remark

### 4.2 测定模块实体

#### 4.2.1 GrowthTest（生长性能）

- growth_id
- pig_id
- start_date
- start_age_days
- start_weight_kg
- end_date
- end_age_days
- end_weight_kg
- test_days
- feed_kg
- adg_g
- adfi_kg
- fcr
- dtsw_days
- end_backfat_mm
- end_ema_cm2
- remark

#### 4.2.2 繁殖性能（母代窝记录 + 测定猪只个体在窝下的信息）

业务口径：繁殖性能记录属于“测定猪只”的信息项，但其内容为“分娩该测定猪只的母猪（母代）的繁殖与断奶记录”，且同一窝可对应多头测定猪只，窝记录共享。

##### A) ReproLitter（母代窝记录，共享）

- litter_id
- unit_id（记录归属单位，默认继承测定猪只所属单位；测定中心可代录）
- dam_ear_tag_no（母猪耳号）
- boar_ear_tag_no（与配公猪耳号，优先选档案，允许手工）
- mating_date
- farrowing_date
- parity（胎次）
- total_born
- male_born
- female_born
- live_count
- weak_count
- stillborn_count
- mummy_count
- malformed_count
- wean_date
- wean_count
- wean_litter_weight_kg
- remark

唯一性建议：dam_ear_tag_no + farrowing_date 唯一。

##### B) ReproPiglet（测定猪只在该窝下的个体信息）

- repro_piglet_id
- litter_id
- pig_id（测定猪只）
- birth_weight_kg
- left_teats
- right_teats
- wean_weight_ind_kg
- remark

#### 4.2.3 CarcassTrait（胴体性状）

- carcass_id
- pig_id
- slaughter_date
- sex
- pre_slaughter_weight_kg
- carcass_weight_left_kg
- carcass_weight_right_kg
- carcass_length_cm
- body_oblique_length_cm
- backfat_shoulder_mm
- backfat_last_rib_mm
- backfat_lumbar_mm
- skin_thickness_6_7rib_mm
- ema_last_rib_cm2
- ema_height_cm
- ema_width_cm
- left_detach_skin_kg
- left_detach_bone_kg
- left_detach_fat_kg
- left_detach_lean_kg
- rib_count
- detach_loss_pct
- hoof_weight_kg
- head_weight_kg
- left_leg_weight_kg
- leg_hip_ratio_pct
- skin_rate_pct
- bone_rate_pct
- fat_rate_pct
- lean_rate_pct
- slaughter_rate_pct
- remark

#### 4.2.4 MeatQuality（猪肉品质）

- meatq_id
- pig_id
- sex
- color_score
- color_l
- color_a
- color_b
- ph_1h
- ph_24h
- drip_loss_pct
- water_holding_pct
- marbling_score
- imf_pct
- imp_pct
- moisture_pct
- tenderness_shear_n
- cooked_meat_rate
- remark

### 4.3 保种场基本信息登记表

#### 4.3.1 ConservationBaseInfo（保种场基本信息）

按年度维护，可用 year 作为业务字段。字段以截图表格为准，建议拆为结构化字段（名称、级别、地址、负责人、电话、邮箱、技术负责人、专业技术人员数量、保护品种名称、群体规模（存栏/种畜/后备/家系等）、占地面积、固定资产等）。

- base_info_id
- unit_id
- year
- name
- level
- code
- address
- principal
- phone
- email
- technical_principal
- technical_title
- technician_count
- protected_breed_name
- population_fields...
- land_area_m2
- facility_area_m2
- fixed_assets_10k_cny
- filler
- contact
- fill_date

## 5. 校验与自动计算规则

### 5.1 日期与日龄联动

- start_age_days = start_date - birth_date
- end_age_days = end_date - birth_date
- test_days = end_date - start_date

### 5.2 生长性能自动计算

当 test_days > 0 且体重、耗料数据完整时：

- adg_g = (end_weight_kg - start_weight_kg) * 1000 / test_days
- adfi_kg = feed_kg / test_days
- fcr = feed_kg / (end_weight_kg - start_weight_kg)

dtsw_days 依赖目标体重（按品种默认值，可由管理单位调整），当具备足够信息时给出推算，否则为空。

### 5.3 繁殖性能（母代窝）校验

- total_born = male_born + female_born
- live_count = total_born - stillborn_count - mummy_count - malformed_count
- weak_count <= live_count

### 5.4 胴体指标计算

- left_detach_total_kg = left_detach_skin_kg + left_detach_bone_kg + left_detach_fat_kg + left_detach_lean_kg
- detach_loss_pct = (carcass_weight_left_kg - left_detach_total_kg) / carcass_weight_left_kg * 100
- slaughter_rate_pct、skin_rate_pct、bone_rate_pct、fat_rate_pct、lean_rate_pct 的分母口径需在规格阶段固定（建议默认以胴体重或宰前活重为分母，由管理单位确认）。

## 6. Excel 导入导出设计

### 6.1 模板原则

- 按模块独立模板：猪只档案、生长性能、繁殖性能（母代窝+测定猪只个体）、胴体性状、猪肉品质、保种场基本信息登记表。
- “一个猪一行”：每个模块行以测定猪只耳标号作为关联键。
- 对于繁殖性能：同一窝可出现多行（对应多头测定猪只），窝级字段必须一致，否则作为冲突错误。

### 6.2 导入流程

- 上传 Excel
- 解析并做预校验（字段格式、必填、唯一键、逻辑校验、可计算字段复算）
- 展示错误明细（行号+字段+原因）
- 用户确认后写入

### 6.3 去重与冲突策略

- 猪只档案：ear_tag_no 全局唯一；重复则报错。
- 各测定模块：默认以（ear_tag_no + 模块关键日期/批次字段）判重；重复则报错不写入。
- 繁殖母代窝：以（dam_ear_tag_no + farrowing_date）判重；若同窝已存在，允许关联并补充该测定猪只的个体字段；若窝级字段不一致，报冲突。

## 7. 系统参数建议（可后台配置）

- target_weight_kg_by_breed（用于 DTSW 计算，按品种配置）
  - 上海白：90 kg
  - 梅山：70 kg
  - 沙乌头：80 kg
  - 浦东白：85 kg
  - 枫泾：76 kg
- default_wean_age_days（默认 24，用于断奶日期提示）
