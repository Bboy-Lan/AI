import type { FoodItem, TasteProfile } from '../types'
import {
  OIL_LABEL,
  OIL_PREF_LABEL,
  SPICY_LABEL,
  SPICY_PREF_LABEL,
  STAPLE_LABEL,
  STAPLE_PREF_LABEL,
  SWEETSALTY_LABEL,
  SWEETSALTY_PREF_LABEL,
  hometownLabel,
} from '../data/campus'

/** 一条投稿的客观口味速览，如：中辣 · 米饭 · 偏咸 */
export function itemTasteSummary(item: FoodItem): string {
  const parts = [SPICY_LABEL[item.spicy]]
  if (item.staple) parts.push(STAPLE_LABEL[item.staple])
  parts.push(SWEETSALTY_LABEL[item.sweetSalty])
  if (item.oil === 'heavy') parts.push('油重')
  if (item.oil === 'less') parts.push('少油')
  return parts.join(' · ')
}

/** 用户口味画像的短标签，用于首页解释与“我的”页 */
export function profileTags(p: TasteProfile): string[] {
  if (p.skipped) return ['先逛逛 · 口味设为不限']
  const tags: string[] = []
  tags.push(SPICY_PREF_LABEL[p.spicy])
  tags.push(SWEETSALTY_PREF_LABEL[p.sweetSalty])
  tags.push(STAPLE_PREF_LABEL[p.staple])
  tags.push(OIL_PREF_LABEL[p.oil])
  const home = hometownLabel(p.hometown)
  if (home) tags.push(`吃货家乡 · ${home}`)
  if (p.quickBudget) tags.push(`预算 ¥${p.quickBudget}`)
  return tags
}

export function describeProfile(p: TasteProfile): string {
  if (p.skipped) return '还没设置口味，当前按全部内容浏览'
  const t = [`辣度${SPICY_PREF_LABEL[p.spicy]}`, SWEETSALTY_PREF_LABEL[p.sweetSalty], STAPLE_PREF_LABEL[p.staple], `油重${OIL_PREF_LABEL[p.oil]}`]
  const home = hometownLabel(p.hometown)
  if (home) t.push(`吃货家乡：${home}`)
  return t.join(' · ')
}

export { OIL_LABEL }
