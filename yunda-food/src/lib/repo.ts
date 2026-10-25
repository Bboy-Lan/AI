import { useSyncExternalStore } from 'react'
import type {
  FeedbackInput,
  FeedbackResult,
  FoodItem,
  RepoState,
  Review,
  SubmissionInput,
  SubmissionResult,
} from '../types'
import { LocalRepo } from './localRepo'
import { SupabaseRepo } from './supabaseRepo'

// 统一数据访问层：页面只依赖此接口。
// - 未配置服务端（默认）：LocalRepo，示例 + 本机草稿，绝不当作“已发布”
// - 配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY：SupabaseRepo
//   状态机 local/checking/online/offline；云端读失败显式报错，不再静默用示例掩盖

export interface FoodRepository {
  readonly mode: 'local' | 'remote'
  getState(): RepoState
  getLastError(): string | null
  subscribe(listener: () => void): () => void
  /** 主动做一次连通性检查，返回是否在线 */
  checkConnection(): Promise<boolean>
  /** 列出云端投稿 + 明确标注的示例；云端故障时抛 RepoError */
  listItems(): Promise<FoodItem[]>
  getItem(id: string): Promise<FoodItem | null>
  submit(input: SubmissionInput): Promise<SubmissionResult>
  listReviews(itemId: string): Promise<Review[]>
  addReview(review: Omit<Review, 'id' | 'createdAt'>): Promise<Review>
  /** 当前登录身份对该投稿是否已评过分 */
  hasOwnRating(itemId: string): Promise<boolean>
  submitFeedback(input: FeedbackInput): Promise<FeedbackResult>
}

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

function createRepo(): FoodRepository {
  if (url && anonKey) {
    try {
      return new SupabaseRepo(url, anonKey)
    } catch (e) {
      console.error('[repo] Supabase 客户端初始化失败，回退本机模式：', e)
      return new LocalRepo()
    }
  }
  return new LocalRepo()
}

export const repo: FoodRepository = createRepo()

/** React 订阅仓储连接状态 */
export function useRepoState(): RepoState {
  return useSyncExternalStore(
    (cb) => repo.subscribe(cb),
    () => repo.getState(),
    () => 'local' as RepoState,
  )
}
