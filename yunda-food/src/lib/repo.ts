import type {
  FoodItem,
  Review,
  SubmissionInput,
  SubmissionResult,
} from '../types'
import { LocalRepo } from './localRepo'
import { SupabaseRepo } from './supabaseRepo'

// 统一数据访问层：页面只依赖此接口。
// - 未配置服务端（当前默认）：LocalRepo，示例 + 本机草稿，绝不当作“已发布”
// - 配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 后：SupabaseRepo，真实跨设备共享
export interface FoodRepository {
  readonly mode: 'local' | 'remote'
  readonly connected: boolean
  listItems(): Promise<FoodItem[]>
  getItem(id: string): Promise<FoodItem | null>
  submit(input: SubmissionInput): Promise<SubmissionResult>
  listReviews(itemId: string): Promise<Review[]>
  addReview(review: Omit<Review, 'id' | 'createdAt'>): Promise<Review>
  /** 同一浏览器对同一投稿是否已有自报评分（一台浏览器只存一份） */
  hasOwnRating(itemId: string): Promise<boolean>
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

function createRepo(): FoodRepository {
  if (url && anonKey) {
    try {
      return new SupabaseRepo(url, anonKey)
    } catch {
      return new LocalRepo()
    }
  }
  return new LocalRepo()
}

export const repo: FoodRepository = createRepo()
