// 云大饭搭子 —— 全站统一数据字段
// 本地示例数据与未来服务端（Supabase）共用同一模型，避免字段分裂。

export type Category = 'meal' | 'snack' | 'drink'
export type PriceMode = 'per_item' | 'per_person'
// per_item：单份价格（一碗/一杯/一份，按“每人一份”估算多人总价）
// per_person：店内人均价格

export type SpicyLevel = 0 | 1 | 2 | 3 // 不辣 / 微辣 / 中辣 / 很辣
export type SweetSalty = 'light' | 'salty' | 'sweet' // 清淡 / 偏咸 / 偏甜
export type OilLevel = 'less' | 'normal' | 'heavy' // 少油 / 正常 / 油重
export type Staple = 'noodle' | 'rice' // 面食（含粉/饺子）/ 米饭

export type SpicyPref = SpicyLevel | 'any'
export type SweetSaltyPref = SweetSalty | 'any'
export type OilPref = OilLevel | 'any'
export type StaplePref = Staple | 'any'

export interface AuthorInfo {
  nickname: string
  hometown?: string | null
  ate: boolean // 自报“我吃过”，非认证
  ateDate?: string | null // 大致吃过日期 YYYY-MM
}

export type ItemSource = 'sample' | 'user'
export type ItemStatus = 'published' | 'pending' | 'local-draft'

export interface FoodItem {
  id: string
  name: string
  category: Category
  venue: string // 具体店 / 食堂窗口
  areaId: string
  campusId: string
  priceMode: PriceMode
  price: number // 元
  spicy: SpicyLevel
  sweetSalty: SweetSalty
  oil: OilLevel
  staple: Staple | null // 饮品/部分小吃可为 null
  flavors: string[]
  cuisine?: string | null // 家乡味线索，如“川渝味”，仅线索不限制
  description: string
  image?: string | null
  source: ItemSource
  status: ItemStatus
  submittedAt: string // ISO 日期
  priceUpdatedAt?: string | null
  author?: AuthorInfo | null
  ratingCount: number
  ratingAvg: number | null
  // 显式声明：当前起始数据没有坐标，UI 绝不显示距离
  hasCoords?: false
}

export interface TasteProfile {
  saved: boolean
  skipped: boolean // “先逛逛”进入，口味为中性
  campusId: string
  hometown: string | null
  spicy: SpicyPref
  sweetSalty: SweetSaltyPref
  staple: StaplePref
  oil: OilPref
  quickBudget: number | null
  savedAt: string | null
}

export interface Review {
  id: string
  itemId: string
  nickname: string
  rating: number // 1-5
  text: string
  ateDate: string // YYYY-MM
  createdAt: string
}

export interface SubmissionInput {
  name: string
  category: Category
  venue: string
  areaId: string
  campusId: string
  priceMode: PriceMode
  price: number
  spicy: SpicyLevel
  sweetSalty: SweetSalty
  oil: OilLevel
  staple: Staple | null
  flavors: string[]
  cuisine?: string | null
  description: string
  image?: string | null // 远程 URL 或本地 dataURL（local 草稿）
  author: AuthorInfo
}

export type SubmissionResult =
  | { ok: true; item: FoodItem; savedRemotely: boolean }
  | { ok: false; savedDraft: boolean; message: string; item?: FoodItem; retryable?: boolean }

// 价格纠错 / 举报：只进待处理队列，不自动改原价
export interface FeedbackInput {
  itemId: string
  type: 'price_correction' | 'report'
  suggestedPrice?: number | null
  reason: string
}

export interface FeedbackResult {
  ok: true
}

export type RepoState =
  | 'local' // 未配置云端：示例 + 本机草稿模式
  | 'checking' // 已配置，正在做首次连通性检查
  | 'online' // 云端读写已验证成功过
  | 'offline' // 已配置但云端请求失败（可读错误信息与重试）

export class RepoError extends Error {
  code: string
  retryable: boolean
  constructor(message: string, code = 'remote_error', retryable = true) {
    super(message)
    this.name = 'RepoError'
    this.code = code
    this.retryable = retryable
  }
}

export function isUuidId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}
