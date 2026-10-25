import type { Category, OilLevel, SpicyLevel, Staple, SweetSalty } from '../types'

export interface Campus {
  id: string
  name: string
  short: string
  hasContent: boolean
}

// 首发只有呈贡校区有起始内容；其他校区显式空状态，不假装覆盖
export const CAMPUSES: Campus[] = [
  { id: 'ynu-chenggong', name: '云南大学 · 呈贡校区', short: '云大呈贡', hasContent: true },
  { id: 'ynu-donglu', name: '云南大学 · 东陆校区', short: '云大东陆', hasContent: false },
  { id: 'other-kunming', name: '昆明其他高校', short: '其他高校', hasContent: false },
]

export interface Area {
  id: string
  name: string
  campusId: string
}

// 食堂名称依据云南大学后勤与公开报道：楠苑食堂=知味堂，梓苑食堂=余味堂（官方亦写作“馀味堂”）
export const AREAS: Area[] = [
  { id: 'zhweitang', name: '楠苑 · 知味堂', campusId: 'ynu-chenggong' },
  { id: 'yuweitang', name: '梓苑 · 余味堂', campusId: 'ynu-chenggong' },
  { id: 'shilinjie', name: '校外 · 仕林街', campusId: 'ynu-chenggong' },
  { id: 'nandu', name: '校外 · 南都街区', campusId: 'ynu-chenggong' },
]

export function areaName(areaId: string): string {
  return AREAS.find((a) => a.id === areaId)?.name ?? '位置待补充'
}

export function campusName(campusId: string): string {
  return CAMPUSES.find((c) => c.id === campusId)?.name ?? '未知校区'
}

export interface HometownOption {
  id: string
  label: string
  cuisine: string
}

// 家乡只作为“家乡味线索”，自填不认证，也不限制只能看家乡菜
export const HOMETOWNS: HometownOption[] = [
  { id: 'yunnan', label: '云南', cuisine: '滇味' },
  { id: 'chuanyu', label: '四川 / 重庆', cuisine: '川渝味' },
  { id: 'guizhou', label: '贵州', cuisine: '黔味' },
  { id: 'hunan', label: '湖南', cuisine: '湘味' },
  { id: 'hubei', label: '湖北', cuisine: '鄂味' },
  { id: 'guangxi', label: '广西', cuisine: '桂柳味' },
  { id: 'guangdong', label: '广东', cuisine: '粤味' },
  { id: 'fujian', label: '福建', cuisine: '闽味' },
  { id: 'zhejiang', label: '浙江', cuisine: '江浙味' },
  { id: 'jiangsu', label: '江苏 / 上海', cuisine: '江浙味' },
  { id: 'jiangxi', label: '江西', cuisine: '赣味' },
  { id: 'anhui', label: '安徽', cuisine: '徽味' },
  { id: 'shandong', label: '山东', cuisine: '鲁味' },
  { id: 'henan', label: '河南', cuisine: '中原味' },
  { id: 'hebei', label: '河北 / 北京 / 天津', cuisine: '北方味' },
  { id: 'shanxi-sx', label: '山西', cuisine: '面食味' },
  { id: 'shaanxi', label: '陕西', cuisine: '西北味' },
  { id: 'dongbei', label: '辽宁 / 吉林 / 黑龙江', cuisine: '东北味' },
  { id: 'xinbei', label: '甘肃 / 青海 / 宁夏 / 新疆 / 内蒙', cuisine: '西北味' },
  { id: 'hainan', label: '海南', cuisine: '粤味' },
  { id: 'other', label: '其他 / 海外', cuisine: '' },
]

export function hometownLabel(id: string | null | undefined): string {
  if (!id) return ''
  return HOMETOWNS.find((h) => h.id === id)?.label ?? ''
}

export function cuisineOfHometown(id: string | null | undefined): string {
  if (!id) return ''
  return HOMETOWNS.find((h) => h.id === id)?.cuisine ?? ''
}

export const CATEGORY_LABEL: Record<Category, string> = {
  meal: '正餐',
  snack: '小吃',
  drink: '饮品',
}

export const SPICY_LABEL: Record<SpicyLevel, string> = ['不辣', '微辣', '中辣', '很辣']
export const SWEETSALTY_LABEL: Record<SweetSalty, string> = {
  light: '清淡',
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
