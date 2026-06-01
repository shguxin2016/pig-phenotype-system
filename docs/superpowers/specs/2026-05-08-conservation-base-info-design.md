# Task 9：保种场基本信息登记表（按年度）设计

## 1. 范围与目标

实现“家畜遗传资源保护场基本信息登记表”（按年度维护）的后端接口与前端录入页。

约束与偏好：

- 数据库存储：继续使用 `ConservationBaseInfoEntity.data`（JSON）保存表内字段
- 群体规模数量：仅存数值（number），不保存“头/只/匹/峰”等单位
- 单位与年度唯一：`(unitId, year)` 唯一（实体已存在唯一索引）

## 2. 数据模型

使用现有实体：[conservation-base-info.entity.ts](file:///workspace/apps/api/src/db/entities/conservation-base-info.entity.ts)

- `unitId: number`
- `year: number`
- `data: Record<string, unknown>`
- `fillDate: string | null`（date）

## 3. 字段字典（data JSON keys）

### 3.1 基础信息

- `name`：名称（string）
- `level`：级别（"国家级" | "省级" | "其他"）
- `code`：编号（string）
- `address`：地址（string）
- `principal`：负责人（string）
- `phone`：电话（string）
- `email`：邮箱（string）
- `farmCode`：畜禽养殖场代码（string）
- `technicianCount`：专业技术人员数量（number）
- `technicalPrincipal`：技术负责人（string）
- `technicalTitleOrDegree`：学历或职称（string）
- `protectedBreedName`：保护品种名称（string）

### 3.2 群体规模（number）

- `inStockCount`：存栏数量
- `familyCount`：家系数量（个）
- `breedingCount`：种畜数量
- `breedingMaleCount`：种公畜数量
- `breedingFemaleBaseCount`：基础母畜数量
- `reserveCount`：后备畜群数量
- `reserveMaleCount`：后备公畜数量
- `reserveFemaleCount`：后备母畜数量

### 3.3 资源与填报

- `landAreaM2`：占地面积（㎡，number）
- `housingAreaM2`：畜舍面积（㎡，number）
- `fixedAssets10kCny`：固定资产（万元，number）
- `filler`：填表人（string）
- `contact`：联系方式（string）
- `fillDate`：日期（string，YYYY-MM-DD）

服务端保存时将 `data.fillDate` 同步写入实体列 `fillDate`（便于过滤与排序）。

## 4. 权限策略

- 保种场：仅可读写本单位（`unitId = user.unitId`）
- 管理单位：可按 `unitId + year` 读取/编辑任意单位
- 测定中心：全量只读（不允许编辑）

## 5. 接口设计

采用“按年度单条”读写，入口为 `/base-info`：

### 5.1 查询（GET）

`GET /base-info?year=YYYY&unitId=<optional>`

- 保种场：忽略 `unitId`，强制用 `user.unitId`
- 测定中心：若传 `unitId` 则查询指定单位；未传 `unitId` 则返回 400
- 管理单位：若传 `unitId` 则查询指定单位；未传 `unitId` 则默认 `user.unitId`

返回：

- 不存在：`null`
- 存在：`{ id, unitId, year, data, fillDate }`

### 5.2 Upsert（PUT）

`PUT /base-info?year=YYYY&unitId=<optional>`

写入规则：

- 保种场：忽略 `unitId`，强制 `user.unitId`
- 管理单位：可写任意 `unitId`；未传 `unitId` 时默认 `user.unitId`
- 测定中心：403

body：

- `{ data: Record<string, unknown> }`（只允许写 data；year/unitId 由 query 与权限决定）

返回：

- `{ record, warnings }`

其中 `warnings` 用于非阻断提示（例如缺失非必填项、邮箱格式异常等）。

## 6. 校验规则

### 6.1 强校验（阻止保存）

- `year`：整数，范围建议 `[2000, 2100]`
- `data`：必须为对象
- 数值字段：必须为有限数值且 `>= 0`（群体规模、面积、资产等）
- `data.level`：必须属于允许值集合
- `fillDate`（若提供）：YYYY-MM-DD

### 6.2 warnings（不阻断）

- `email` 不符合基本格式
- `phone` 不符合基本格式
- 缺失关键字段（例如 name、address、protectedBreedName）时提示，但允许保存

## 7. 前端页面（单页表单）

新增页面：`/base-info`

- 顶部：年度选择（默认当前年，可切换）
- 表单：按“基础信息/群体规模/资源与填报”分块
- 保存：调用 `PUT /base-info?year=...`
- 管理单位：增加单位下拉（调用 `/meta/units`）以选择编辑目标单位
- 测定中心：单位下拉 + 只读展示（保存按钮隐藏或 disabled）
- warnings：以提示框展示

## 8. 测试

后端：
- 保种场只能写本单位（忽略 unitId）
- 管理单位可写任意单位
- 测定中心写入 403
- `(unitId, year)` upsert 覆盖同一条记录

