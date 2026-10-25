import type { FoodItem, TasteProfile } from '../types'
import {
  areaName,
  cuisineOfHometown,
  OIL_LABEL,
  SPICY_LABEL,
  SWEETSALTY_LABEL,
  STAPLE_LABEL,
} from '../data/campus'

// 预算口径：人均 / 总额（总额时按人数折算每人上限）
export interface BudgetFilter {
  basis: 'per_person' | 'total'
  amount: number | null
  people: number
}

export interface FoodFilters {
  campusId: string
  areaIds: string[]
  categories: FoodItem['category'][]
  query: string
  budget: BudgetFilter
  noSpicy: boolean // 硬条件：完全不要辣
  hometownOnly: boolean // 只要家乡味（硬过滤；默认关闭，家乡默认只是线索）
}

export const EMPTY_BUDGET: BudgetFilter = { basis: 'per_person', amount: null, people: 1 }

export function defaultFilters(campusId: string): FoodFilters {
  return {
    campusId,
    areaIds: [],
    categories: [],
    query: '',
    budget: EMPTY_BUDGET,
    noSpicy: false,
    hometownOnly: false,
  }
}

/** 折算“每人价格”：单份菜按每人一份估算，人均菜即店内人均。UI 必须向用户明示。 */
export function perPersonPrice(item: Pick<FoodItem, 'price'>): number {
  return item.price
}

/** 多人估价（估算，不是精确 AA） */
export function estimateTotal(item: Pick<FoodItem, 'price'>, people: number): number {
  return Math.round(item.price * people * 100) / 100
}

export function priceBasisLabel(item: Pick<FoodItem, 'priceMode'>): string {
  return item.priceMode === 'per_person' ? '店内人均' : '单份价格'
}

export interface MatchResult {
  item: FoodItem
  score: number
  reasons: string[]
}

function perPersonCap(b: BudgetFilter): number | null {
  if (b.amount == null || Number.isNaN(b.amount)) return null
  if (b.basis === 'per_person') return b.amount
  const people = Math.max(1, Math.round(b.people) || 1)
  return b.amount / people
}

export function matchesHard(item: FoodItem, f: FoodFilters): boolean {
  if (item.campusId !== f.campusId) return false
  if (f.areaIds.length > 0 && !f.areaIds.includes(item.areaId)) return false
  if (f.categories.length > 0 && !f.categories.includes(item.category)) return false
  if (f.noSpicy && item.spicy > 0) return false
  // 家乡味硬过滤在 rankItems 中结合 profile 处理
  const cap = perPersonCap(f.budget)
  if (cap !== null && perPersonPrice(item) > cap + 0.001) return false
  const q = f.query.trim().toLowerCase()
  if (q) {
    const hay = [item.name, item.venue, item.description, item.cuisine ?? '', ...item.flavors]
      .join(' ')
      .toLowerCase()
    if (!hay.includes(q)) return false
  }
  return true
}

function buildReasons(
  item: FoodItem,
  profile: TasteProfile,
  f: FoodFilters,
): { score: number; reasons: string[] } {
  const reasons: string[] = []
  let score = 0

  const tasteActive =
    !profile.skipped &&
    (profile.spicy !== 'any' ||
      profile.sweetSalty !== 'any' ||
      profile.staple !== 'any' ||
      profile.oil !== 'any')

  if (tasteActive) {
    if (profile.spicy !== 'any') {
      if (item.spicy === profile.spicy) {
        score += 3
        reasons.push(`辣度合你（${SPICY_LABEL[item.spicy]}）`)
      } else if (Math.abs(item.spicy - profile.spicy) === 1) {
        score += 1
        reasons.push(`辣度接近（${SPICY_LABEL[item.spicy]}）`)
      }
    }
    if (profile.staple !== 'any' && item.staple === profile.staple) {
      score += 3
      reasons.push(`正合你的${STAPLE_LABEL[item.staple]}胃`)
    }
    if (profile.sweetSalty !== 'any' && item.sweetSalty === profile.sweetSalty) {
      score += 2
      reasons.push(`${SWEETSALTY_LABEL[item.sweetSalty]}口，对味`)
    }
    if (profile.oil !== 'any' && item.oil === profile.oil) {
      score += 1
      reasons.push(`油重：${OIL_LABEL[item.oil]}`)
    }
  }

  // 家乡只是线索：默认弱加权；“家乡味优先”时加强（权重仍只是排序线索）
  const homeCuisine = cuisineOfHometown(profile.hometown)
  if (homeCuisine && item.cuisine === homeCuisine) {
    score += f.hometownOnly ? 5 : 1
    reasons.push(`家乡味线索 · ${homeCuisine}`)
  }

  const cap = perPersonCap(f.budget)
  if (cap !== null && perPersonPrice(item) <= cap) {
    score += 1
    if (f.budget.basis === 'per_person') {
      reasons.push(
        item.priceMode === 'per_person'
          ? `人均 ¥${item.price}，在 ¥${f.budget.amount} 预算内`
          : `单份 ¥${item.price}，按每人一份在预算内`,
      )
    } else {
      reasons.push(
        `${f.budget.people} 人估价约 ¥${estimateTotal(item, f.budget.people)}，在 ¥${f.budget.amount} 总额内`,
      )
    }
  }

  if (f.areaIds.length === 1 && f.areaIds[0] === item.areaId) {
    reasons.push(`就在${areaName(item.areaId)}`)
  }

  if (f.query.trim()) {
    reasons.push('命中你的搜索')
  }

  return { score, reasons: reasons.slice(0, 3) }
}

export function rankItems(
  items: FoodItem[],
  f: FoodFilters,
  profile: TasteProfile,
): MatchResult[] {
  const homeCuisine = cuisineOfHometown(profile.hometown)
  return items
    .filter((item) => {
      if (!matchesHard(item, f)) return false
      if (f.hometownOnly && (!homeCuisine || item.cuisine !== homeCuisine)) return false
      return true
    })
    .map((item) => {
      const { score, reasons } = buildReasons(item, profile, f)
      // 真实投稿略优先于示例；有真实评分时小权重（样本越多越可信）
      let finalScore = score
      if (item.source === 'user') finalScore += 0.5
      if (item.ratingCount > 0 && item.ratingAvg != null) {
        finalScore += Math.min(1.5, item.ratingCount / 8) * (item.ratingAvg / 5)
      }
      return { item, score: finalScore, reasons }
    })
    .sort((a, b) => b.score - a.score || a.item.price - b.item.price || a.item.id.localeCompare(b.item.id))
}

/** 盲盒：在合格集合里等概率随机抽取 */
export function drawOne(
  candidates: MatchResult[],
  excludeId?: string,
): MatchResult | null {
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]
  const pool = candidates.filter((c) => c.item.id !== excludeId)
  const list = pool.length > 0 ? pool : candidates
  return list[Math.floor(Math.random() * list.length)]
}

/** 空结果时给出可执行的调整建议 */
export function emptySuggestions(items: FoodItem[], f: FoodFilters): string[] {
  const tips: string[] = []
  const cap = perPersonCap(f.budget)
  if (cap !== null) {
    const cheapest = items
      .filter(
        (i) =>
          i.campusId === f.campusId &&
          (f.areaIds.length === 0 || f.areaIds.includes(i.areaId)) &&
          (f.categories.length === 0 || f.categories.includes(i.category)),
      )
      .sort((a, b) => a.price - b.price)[0]
    if (cheapest && cheapest.price > cap) {
      tips.push(
        f.budget.basis === 'per_person'
          ? `当前区域+类别最便宜是 ¥${cheapest.price}（${cheapest.name}），把预算提到 ¥${cheapest.price} 以上`
          : `${f.budget.people} 人至少要 ¥${Math.ceil(cheapest.price * f.budget.people)} 总额才够（${cheapest.name}）`,
      )
    } else {
      tips.push('把预算放宽一点，或改成“人均”口径试试')
    }
  }
  if (f.noSpicy) tips.push('关掉“完全不要辣”，微辣也有很多温和选择')
  if (f.areaIds.length > 0) tips.push('取消区域限制，看看校内校外其他片区')
  if (f.categories.length > 0) tips.push('类别选“不限”，正餐小吃饮品一起抽')
  if (f.hometownOnly) tips.push('先别只看家乡味，换口味也许有惊喜')
  if (tips.length === 0) tips.push('换几个关键词，或清空搜索条件')
  return tips.slice(0, 3)
}
