import { useEffect, useSyncExternalStore } from 'react'
import type {
  FeedbackInput,
  FeedbackResult,
  AdminOverview,
  AdminProfile,
  AdminReview,
  FoodItem,
  MyProfileStatus,
  MyReview,
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
  /** 绕过列表缓存，从云端拉取最新投稿与聚合评分。 */
  refreshItems(): Promise<FoodItem[]>
  getItem(id: string): Promise<FoodItem | null>
  /** 当前匿名身份发布的云端投稿（无会话/本地模式返回空） */
  listMyItems(): Promise<FoodItem[]>
  /** 投稿数据可能变化（发布成功、评分后）时调用，使缓存失效 */
  invalidateItems(): void
  submit(input: SubmissionInput): Promise<SubmissionResult>
  listReviews(itemId: string): Promise<Review[]>
  addReview(review: Omit<Review, 'id' | 'createdAt'>): Promise<Review>
  /** 当前登录身份对该投稿的评价（用于“修改评分”预填），没有则 null */
  getOwnReview(itemId: string): Promise<MyReview | null>
  /** 当前登录身份对该投稿是否已评过分 */
  hasOwnRating(itemId: string): Promise<boolean>
  submitFeedback(input: FeedbackInput): Promise<FeedbackResult>
  /** 写入的身份永远由 Supabase auth.uid() 绑定，前端不传 userId。 */
  saveIdentity(input: { foodieId: string; hometown: string | null; defaultArea: string | null; tastes: Record<string, unknown> }): Promise<void>
  listFavoriteIds(): Promise<string[]>
  toggleFavorite(itemId: string): Promise<boolean>
  listMyReviews(): Promise<MyReview[]>
  /** 只读当前身份的限制状态与原因；不向其他用户暴露。 */
  getMyProfileStatus(): Promise<MyProfileStatus>
  /** 管理员权限始终由服务端 admin_users + auth.uid() 判定。 */
  isAdmin(): Promise<boolean>
  /** 仅用于项目所有者将当前匿名设备登记为管理员；不是权限凭据。 */
  getCurrentUserId(): Promise<string | null>
  listAdminItems(includeHidden: boolean): Promise<FoodItem[]>
  setItemVisibility(input: { itemId: string; hidden: boolean; reason?: string }): Promise<void>
  getAdminOverview(): Promise<AdminOverview>
  listAdminReviews(includeHidden: boolean): Promise<AdminReview[]>
  setReviewVisibility(input: { reviewId: string; hidden: boolean; reason?: string }): Promise<void>
  listAdminProfiles(): Promise<AdminProfile[]>
  setProfileRestriction(input: { userId: string; restricted: boolean; reason?: string }): Promise<void>
  /** 已确认的管理员才能为另一独立浏览器会话授予管理权限。 */
  grantAdminDevice(userId: string): Promise<void>
  /** 起始示例的云端全局可见性；管理员隐藏后所有客户端共同生效。 */
  listHiddenSampleIds(): Promise<string[]>
  setSampleVisibility(input: { sampleId: string; hidden: boolean; reason?: string }): Promise<void>
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

// 全局数据变更事件：投稿成功、评分提交后派发；列表/我的页监听后重新拉取
export const DATA_CHANGED_EVENT = 'yffd:data-changed'
export function notifyDataChanged(detail: string = 'items', dropCache = true) {
  if (dropCache) repo.invalidateItems()
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail }))
}

export interface RemoteSyncState { syncing: boolean; lastSuccessAt: number | null; error: string | null }
const SYNC_INTERVAL = 5_000
let syncState: RemoteSyncState = { syncing: false, lastSuccessAt: null, error: null }
const syncListeners = new Set<() => void>()
let syncTimer: number | null = null
let syncUsers = 0
let syncInFlight: Promise<void> | null = null
let failures = 0
const emitSync = () => syncListeners.forEach((listener) => listener())
const setSync = (next: RemoteSyncState) => { syncState = next; emitSync() }
const scheduleSync = (delay: number) => {
  if (syncTimer != null) window.clearTimeout(syncTimer)
  if (syncUsers > 0 && repo.mode === 'remote' && !document.hidden) {
    syncTimer = window.setTimeout(() => void refreshRemoteData(), delay)
  }
}
export function refreshRemoteData(): Promise<void> {
  if (repo.mode !== 'remote' || document.hidden) return Promise.resolve()
  if (syncInFlight) return syncInFlight
  setSync({ ...syncState, syncing: true, error: null })
  syncInFlight = repo.refreshItems()
    .then(() => {
      failures = 0
      setSync({ syncing: false, lastSuccessAt: Date.now(), error: null })
      notifyDataChanged('remote-sync', false)
    })
    .catch((error: unknown) => {
      failures += 1
      setSync({ ...syncState, syncing: false, error: error instanceof Error ? error.message : '暂未更新' })
    })
    .finally(() => {
      syncInFlight = null
      scheduleSync(Math.min(SYNC_INTERVAL * 2 ** failures, 30_000))
    })
  return syncInFlight
}
const onVisibility = () => { if (document.visibilityState === 'visible') void refreshRemoteData() }
const onOnline = () => void refreshRemoteData()
export function useRemoteSync(): RemoteSyncState {
  useEffect(() => {
    if (repo.mode !== 'remote') return
    syncUsers += 1
    if (syncUsers === 1) {
      document.addEventListener('visibilitychange', onVisibility)
      window.addEventListener('online', onOnline)
      scheduleSync(SYNC_INTERVAL)
    }
    return () => {
      syncUsers -= 1
      if (syncUsers === 0) {
        if (syncTimer != null) window.clearTimeout(syncTimer)
        syncTimer = null
        document.removeEventListener('visibilitychange', onVisibility)
        window.removeEventListener('online', onOnline)
      }
    }
  }, [])
  return useSyncExternalStore((cb) => { syncListeners.add(cb); return () => syncListeners.delete(cb) }, () => syncState, () => syncState)
}
