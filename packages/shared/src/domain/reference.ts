export type UnitType = '保种场' | '测定中心' | '管理单位'

export type Role = '保种场' | '测定中心' | '管理单位'

export type BreedName = '梅山' | '沙乌头' | '浦东白' | '枫泾' | '上海白'

export const BREED_NAMES: readonly BreedName[] = ['梅山', '沙乌头', '浦东白', '枫泾', '上海白']

export const DEFAULT_DTSW_TARGET_WEIGHT_KG_BY_BREED_NAME: Readonly<Record<BreedName, number>> = {
  上海白: 90,
  梅山: 70,
  沙乌头: 80,
  浦东白: 85,
  枫泾: 76
}

export const ROLE_NAMES: readonly Role[] = ['保种场', '测定中心', '管理单位']

export const UNITS: readonly {
  name: string
  type: UnitType
  defaultBreedName?: BreedName
}[] = [
  { name: '上海市嘉定区动物疫病预防控制中心', type: '保种场', defaultBreedName: '梅山' },
  { name: '上海沙乌头农业科技有限公司', type: '保种场', defaultBreedName: '沙乌头' },
  { name: '上海浦汇良种繁育科技有限公司', type: '保种场', defaultBreedName: '浦东白' },
  { name: '上海沁侬牧业科技有限公司', type: '保种场', defaultBreedName: '枫泾' },
  { name: '上海市农业科学院庄行综合试验站', type: '保种场', defaultBreedName: '上海白' },
  { name: '上海市种畜禽测定中心', type: '测定中心' },
  { name: '上海市动物疫病预防控制中心', type: '管理单位' }
]

export const UNIT_NAMES: readonly string[] = UNITS.map((u) => u.name)
