import type { Category, OilLevel, SpicyLevel, Staple, SweetSalty } from '../types'

export interface Campus {
  id: string
  name: string
  short: string
  hasContent: boolean
}

export const DEFAULT_CITY_ID = 'kunming'

// 平台内容范围固定为昆明市；具体地点在下方单独选择，不再以高校/校区作为一级范围。
export const CAMPUSES: Campus[] = [
  { id: DEFAULT_CITY_ID, name: '昆明市', short: '昆明市', hasContent: true },
]

export interface Area {
  id: string
  name: string
  campusId: string
}

// 食堂名称依据云南大学后勤与公开报道：楠苑食堂=知味堂，梓苑食堂=余味堂（官方亦写作“馀味堂”）
export const AREAS: Area[] = [
  { id: 'ynu-chenggong', name: '云南大学呈贡校区', campusId: DEFAULT_CITY_ID },
  { id: 'ynu-donglu', name: '云南大学东陆校区', campusId: DEFAULT_CITY_ID },
  { id: 'university-town', name: '大学城', campusId: DEFAULT_CITY_ID },
  { id: 'chenggong', name: '呈贡区', campusId: DEFAULT_CITY_ID },
  { id: 'wuhua', name: '五华区', campusId: DEFAULT_CITY_ID },
  { id: 'panlong', name: '盘龙区', campusId: DEFAULT_CITY_ID },
  { id: 'xishan', name: '西山区', campusId: DEFAULT_CITY_ID },
  { id: 'guandu', name: '官渡区', campusId: DEFAULT_CITY_ID },
  { id: 'jinning', name: '晋宁区', campusId: DEFAULT_CITY_ID },
  { id: 'anning', name: '安宁市', campusId: DEFAULT_CITY_ID },
  { id: 'zhweitang', name: '楠苑 · 知味堂', campusId: DEFAULT_CITY_ID },
  { id: 'yuweitang', name: '梓苑 · 余味堂', campusId: DEFAULT_CITY_ID },
  { id: 'shilinjie', name: '仕林街', campusId: DEFAULT_CITY_ID },
  { id: 'nandu', name: '南都街区', campusId: DEFAULT_CITY_ID },
]

export function areaName(areaId: string): string {
  return AREAS.find((a) => a.id === areaId)?.name ?? '位置待补充'
}

export function campusName(campusId: string): string {
  if (campusId === 'ynu-chenggong' || campusId === 'ynu-donglu' || campusId === 'other-kunming') return '昆明市'
  return CAMPUSES.find((c) => c.id === campusId)?.name ?? '昆明市'
}

export interface HometownOption {
  id: string
  label: string
  cuisine: string
}

// 仅用于兼容早期的省级家乡选项；新资料由用户自由填写户籍/家乡地点。
export const HOMETOWNS: HometownOption[] = [
  { id: 'beijing', label: '北京市', cuisine: '京味' }, { id: 'tianjin', label: '天津市', cuisine: '津味' },
  { id: 'hebei', label: '河北省', cuisine: '北方味' }, { id: 'shanxi-sx', label: '山西省', cuisine: '面食味' },
  { id: 'neimenggu', label: '内蒙古自治区', cuisine: '草原风味' }, { id: 'liaoning', label: '辽宁省', cuisine: '东北味' },
  { id: 'jilin', label: '吉林省', cuisine: '东北味' }, { id: 'heilongjiang', label: '黑龙江省', cuisine: '东北味' },
  { id: 'shanghai', label: '上海市', cuisine: '江浙味' }, { id: 'jiangsu', label: '江苏省', cuisine: '江浙味' },
  { id: 'zhejiang', label: '浙江省', cuisine: '江浙味' }, { id: 'anhui', label: '安徽省', cuisine: '徽味' },
  { id: 'fujian', label: '福建省', cuisine: '闽味' }, { id: 'jiangxi', label: '江西省', cuisine: '赣味' },
  { id: 'shandong', label: '山东省', cuisine: '鲁味' }, { id: 'henan', label: '河南省', cuisine: '中原味' },
  { id: 'hubei', label: '湖北省', cuisine: '鄂味' }, { id: 'hunan', label: '湖南省', cuisine: '湘味' },
  { id: 'guangdong', label: '广东省', cuisine: '粤味' }, { id: 'guangxi', label: '广西壮族自治区', cuisine: '桂柳味' },
  { id: 'hainan', label: '海南省', cuisine: '海南风味' }, { id: 'chongqing', label: '重庆市', cuisine: '川渝味' },
  { id: 'sichuan', label: '四川省', cuisine: '川味' }, { id: 'guizhou', label: '贵州省', cuisine: '黔味' },
  { id: 'yunnan', label: '云南省', cuisine: '滇味' }, { id: 'xizang', label: '西藏自治区', cuisine: '藏味' },
  { id: 'shaanxi', label: '陕西省', cuisine: '西北味' }, { id: 'gansu', label: '甘肃省', cuisine: '西北味' },
  { id: 'qinghai', label: '青海省', cuisine: '西北味' }, { id: 'ningxia', label: '宁夏回族自治区', cuisine: '西北味' },
  { id: 'xinjiang', label: '新疆维吾尔自治区', cuisine: '新疆味' }, { id: 'hongkong', label: '香港特别行政区', cuisine: '港式' },
  { id: 'macau', label: '澳门特别行政区', cuisine: '澳葡风味' }, { id: 'taiwan', label: '台湾地区', cuisine: '台味' },
]

export function hometownLabel(id: string | null | undefined): string {
  if (!id) return ''
  return HOMETOWNS.find((h) => h.id === id)?.label ?? id
}

export const CATEGORY_LABEL: Record<Category, string> = {
  meal: '正餐',
  snack: '小吃',
  drink: '饮品',
}

export const SPICY_LABEL: Record<SpicyLevel, string> = ['不辣', '微辣', '中辣', '很辣']
export const SWEETSALTY_LABEL: Record<SweetSalty, string> = {
  light: '清淡',
  normal: '正常',
  salty: '偏咸',
  sweet: '偏甜',
}
export const OIL_LABEL: Record<OilLevel, string> = { less: '少油', normal: '正常', heavy: '油重' }
export const STAPLE_LABEL: Record<Staple, string> = { noodle: '面食', rice: '米饭' }

export const SPICY_PREF_LABEL: Record<SpicyLevel | 'any', string> = {
  0: '不辣',
  1: '微辣',
  2: '中辣',
  3: '很辣',
  any: '都行',
}
export const SWEETSALTY_PREF_LABEL: Record<SweetSalty | 'any', string> = {
  light: '清淡',
  normal: '正常',
  salty: '偏咸',
  sweet: '偏甜',
  any: '都行',
}
export const OIL_PREF_LABEL: Record<OilLevel | 'any', string> = {
  less: '少油',
  normal: '正常',
  heavy: '油重',
  any: '都行',
}
export const STAPLE_PREF_LABEL: Record<Staple | 'any', string> = {
  noodle: '爱面食',
  rice: '爱米饭',
  any: '都可以',
}

// 预算快捷金额
export const QUICK_BUDGETS_PER_PERSON = [10, 15, 20, 30]
export const QUICK_BUDGETS_TOTAL = [30, 50, 80, 120]
