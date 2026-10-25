import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import type {
  AuthorInfo,
  FeedbackInput,
  FeedbackResult,
  FoodItem,
  RepoError as RepoErrorType,
  RepoState,
  Review,
  SubmissionInput,
  SubmissionResult,
} from '../types'
import { RepoError, isUuidId } from '../types'
import { SAMPLE_ITEMS } from '../data/seed'
import type { FoodRepository } from './repo'

// 安全模型见 server/supabase-schema.sql：
// - 浏览：anon/authenticated 只读白名单列
// - 投稿/评分：必须 Anonymous Sign-In（authenticated），经 SECURITY DEFINER RPC
// - 身份由 auth.uid() 决定，统计列由触发器维护，前端无法伪造

type Row = Record<string, unknown>

function str(v: unknown): string {
  return v == null ? '' : String(v)
}

function mapItem(row: Row): FoodItem {
  const author: AuthorInfo = {
    nickname: str(row.author_nickname) || '云大同学',
    hometown: (row.author_hometown as string | null) ?? null,
    ate: Boolean(row.author_ate),
    ateDate: (row.author_ate_date as string | null) ?? null,
  }
  return {
    id: str(row.id),
    name: str(row.name),
    category: row.category as FoodItem['category'],
    venue: str(row.venue),
    areaId: str(row.area_id),
    campusId: str(row.campus_id),
    priceMode: row.price_mode as FoodItem['priceMode'],
    price: Number(row.price),
    spicy: Number(row.spicy) as FoodItem['spicy'],
    sweetSalty: row.sweet_salty as FoodItem['sweetSalty'],
    oil: row.oil as FoodItem['oil'],
    staple: (row.staple as FoodItem['staple']) ?? null,
    flavors: (row.flavors as string[]) ?? [],
    cuisine: (row.cuisine as string | null) ?? null,
    description: str(row.description),
    image: (row.image as string | null) ?? null,
    source: 'user',
    status: 'published',
    submittedAt: str(row.submitted_at),
    priceUpdatedAt: (row.price_updated_at as string | null) ?? null,
    author,
    ratingCount: Number(row.rating_count ?? 0),
    ratingAvg: row.rating_avg == null ? null : Number(row.rating_avg),
    hasCoords: false,
  }
}

// 只选择展示列，owner 等内部列不请求
const ITEM_COLUMNS =
  'id,name,category,venue,area_id,campus_id,price_mode,price,spicy,sweet_salty,oil,staple,flavors,cuisine,description,image,source,status,submitted_at,price_updated_at,author_nickname,author_hometown,author_ate,author_ate_date,rating_count,rating_avg'

const REVIEW_COLUMNS = 'id,item_id,nickname,rating,text,ate_date,created_at'

/** 把 PostgREST/Auth/Storage 错误翻译为可操作提示 */
function toRepoError(where: string, err: unknown): RepoErrorType {
  const anyErr = err as { message?: string; code?: string; status?: number; name?: string } | null
  const message = anyErr?.message ?? '未知网络错误'
  const code = anyErr?.code ?? String(anyErr?.status ?? '')

  // 资源没建 / schema 没更新
  if (code === '42P01' || /relation .* does not exist|Could not find the table/.test(message)) {
    return new RepoError(
      `云端数据库还没初始化（${where}：缺少表）。请在 Supabase SQL Editor 执行最新 server/supabase-schema.sql。`,
      'schema_missing',
      true,
    )
  }
  if (/Could not find the function|function .* does not exist|42883|42501/.test(message)) {
    return new RepoError(
      `云端接口版本过旧（${where}：RPC 缺失或无权限）。请执行最新 server/supabase-schema.sql 完成迁移。`,
      'rpc_missing',
      true,
    )
  }
  // 匿名登录未开启
  if (
    /anonymous.*disabled|signups?.*disabled|anonymous_provider_disabled|signup_disabled/.test(message) ||
    code === 'anonymous_provider_disabled'
  ) {
    return new RepoError(
      'Supabase 还没开启 Anonymous Sign-Ins。请到 Authentication → Sign In/Providers → Anonymous 打开后重试。',
      'anon_disabled',
      true,
    )
  }
  // 鉴权失败
  if (anyErr?.status === 401 || code === '28000' || /not_authenticated|JWT|invalid api key/i.test(message)) {
    return new RepoError(`登录状态失效（${where}）。请重试，若仍失败请刷新页面。`, 'unauthorized', true)
  }
  // 网络层
  if (/Failed to fetch|NetworkError|fetch failed|load failed/i.test(message)) {
    return new RepoError(`连不上云端（${where}）。请检查网络后重试。`, 'network', true)
  }
  return new RepoError(`${where}失败：${message}`, code || 'remote_error', true)
}

export class SupabaseRepo implements FoodRepository {
  readonly mode = 'remote' as const
  private db: SupabaseClient
  private state: RepoState = 'checking'
  private lastError: string | null = null
  private listeners = new Set<() => void>()
  private sessionPromise: Promise<Session | null> | null = null
  private checkedOnce = false

  constructor(url: string, anonKey: string) {
    this.db = createClient(url, anonKey, {
      auth: {
        persistSession: true, // 会话落 localStorage，刷新/重启复用，不重复建匿名用户
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
    // 应用启动后做一次轻量连通性检查（不强制登录，浏览不需要账号）
    void this.checkConnection()
  }

  getState(): RepoState {
    return this.state
  }
  getLastError(): string | null {
    return this.lastError
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  private setState(next: RepoState, error: string | null = null) {
    this.state = next
    this.lastError = error
    this.listeners.forEach((l) => l())
  }

  async checkConnection(): Promise<boolean> {
    try {
      const { error } = await this.db
        .from('food_items')
        .select('id', { count: 'estimated', head: true })
        .eq('status', 'published')
        .limit(1)
      if (error) throw error
      this.setState('online')
      this.checkedOnce = true
      return true
    } catch (e) {
      const re = toRepoError('连接检查', e)
      this.setState('offline', re.message)
      if (!this.checkedOnce) console.warn('[repo] 云端暂不可用：', re.message)
      return false
    }
  }

  /** 投稿/评分前确保有匿名会话；复用现有会话，避免重复创建 */
  private async ensureSession(): Promise<Session> {
    const { data: existing } = await this.db.auth.getSession()
    if (existing.session) return existing.session
    if (!this.sessionPromise) {
      this.sessionPromise = (async () => {
        const { data, error } = await this.db.auth.signInAnonymously()
        if (error) throw toRepoError('匿名登录', error)
        return data.session
      })()
    }
    try {
      const session = await this.sessionPromise
      if (!session) throw new RepoError('匿名登录没有返回会话', 'no_session')
      return session
    } finally {
      // 失败后允许下一次重试重新发起
      setTimeout(() => {
        this.sessionPromise = null
      }, 0)
    }
  }

  async listItems(): Promise<FoodItem[]> {
    const { data, error } = await this.db
      .from('food_items')
      .select(ITEM_COLUMNS)
      .eq('status', 'published')
      .order('submitted_at', { ascending: false })
    if (error) {
      const re = toRepoError('读取投稿', error)
      this.setState('offline', re.message)
      throw re
    }
    this.setState('online')
    const remote = (data ?? []).map((r) => mapItem(r as Row))
    // 云端正常时，示例仍展示但始终带“示例”印章
    return [...remote, ...SAMPLE_ITEMS]
  }

  async getItem(id: string): Promise<FoodItem | null> {
    if (SAMPLE_ITEMS.some((s) => s.id === id)) {
      return SAMPLE_ITEMS.find((s) => s.id === id) ?? null
    }
    if (!isUuidId(id)) return null
    const { data, error } = await this.db
      .from('food_items')
      .select(ITEM_COLUMNS)
      .eq('id', id)
      .maybeSingle()
    if (error) throw toRepoError('读取详情', error)
    return data ? mapItem(data as Row) : null
  }

  /** 上传到仅属于当前匿名身份的目录；服务端策略会再次校验路径与类型 */
  private async uploadImage(uid: string, image: string): Promise<string> {
    if (!image.startsWith('data:')) return image // 已是远程 URL（理论上当前投稿只产生 dataURL）
    const res = await fetch(image)
    const blob = await res.blob()
    if (!/^image\/(jpeg|png|webp)$/.test(blob.type)) {
      throw new RepoError('图片类型不被接受，仅支持 JPG/PNG/WebP', 'bad_image_type', false)
    }
    // 浏览器端已压缩，这里再做一道 8MB 硬保护
    if (blob.size > 8 * 1024 * 1024) {
      throw new RepoError('图片过大（超过 8MB）', 'image_too_large', false)
    }
    const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${uid}/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await this.db.storage.from('food-photos').upload(path, blob, {
      contentType: blob.type,
      upsert: false,
    })
    if (upErr) throw toRepoError('图片上传', upErr)
    const { data } = this.db.storage.from('food-photos').getPublicUrl(path)
    return data.publicUrl
  }

  async submit(input: SubmissionInput): Promise<SubmissionResult> {
    let session: Session
    try {
      session = await this.ensureSession()
    } catch (e) {
      return {
        ok: false,
        savedDraft: false,
        message: e instanceof Error ? e.message : '登录失败，请重试',
        retryable: true,
      }
    }

    try {
      // 先传图，再写库：写库失败只会留下孤儿图片，不会产生无图/重复投稿
      const imageUrl = input.image ? await this.uploadImage(session.user.id, input.image) : null
      const { data, error } = await this.db.rpc('submit_food_item', {
        p_name: input.name,
        p_category: input.category,
        p_venue: input.venue,
        p_area_id: input.areaId,
        p_campus_id: input.campusId,
        p_price_mode: input.priceMode,
        p_price: input.price,
        p_spicy: input.spicy,
        p_sweet_salty: input.sweetSalty,
        p_oil: input.oil,
        p_staple: input.staple ?? '',
        p_flavors: input.flavors,
        p_cuisine: input.cuisine ?? '',
        p_description: input.description,
        p_image: imageUrl ?? '',
        p_nickname: input.author.nickname,
        p_hometown: input.author.hometown ?? '',
        p_ate: input.author.ate,
        p_ate_date: input.author.ateDate ?? '',
      })
      if (error) throw toRepoError('投稿保存', error)
      const item = mapItem((data ?? {}) as Row)
      if (!item.id) throw new RepoError('投稿已发送但没拿到记录，请刷新列表确认', 'no_return')
      this.setState('online')
      return { ok: true, item, savedRemotely: true }
    } catch (e) {
      const re = e instanceof RepoError ? e : toRepoError('投稿', e)
      if (this.state !== 'offline' && re.code === 'network') this.setState('offline', re.message)
      return {
        ok: false,
        savedDraft: false,
        message: re.message,
        retryable: re.retryable,
      }
    }
  }

  async listReviews(itemId: string): Promise<Review[]> {
    const { data, error } = await this.db
      .from('reviews')
      .select(REVIEW_COLUMNS)
      .eq('item_id', itemId)
      .order('created_at', { ascending: false })
    if (error) throw toRepoError('读取评论', error)
    return (data ?? []).map((r) => this.mapReview(r as Row))
  }

  private mapReview(r: Row): Review {
    return {
      id: str(r.id),
      itemId: str(r.item_id),
      nickname: str(r.nickname),
      rating: Number(r.rating),
      text: str(r.text),
      ateDate: str(r.ate_date),
      createdAt: str(r.created_at),
    }
  }

  async hasOwnRating(itemId: string): Promise<boolean> {
    if (!isUuidId(itemId)) return false
    const { data: sess } = await this.db.auth.getSession()
    if (!sess.session) return false
    const { data, error } = await this.db
      .from('reviews')
      .select('id')
      .eq('item_id', itemId)
      .eq('user_id', sess.session.user.id)
      .maybeSingle()
    if (error) throw toRepoError('读取评分状态', error)
    return Boolean(data)
  }

  async addReview(input: Omit<Review, 'id' | 'createdAt'>): Promise<Review> {
    if (SAMPLE_ITEMS.some((s) => s.id === input.itemId)) {
      throw new RepoError('示例内容不能提交真实云端评分，它不是云大现场投稿。', 'sample_review', false)
    }
    await this.ensureSession()
    const { data, error } = await this.db.rpc('submit_review', {
      p_item_id: input.itemId,
      p_nickname: input.nickname,
      p_rating: input.rating,
      p_text: input.text,
      p_ate_date: input.ateDate,
    })
    if (error) throw toRepoError('评论保存', error)
    return this.mapReview((data ?? {}) as Row)
  }

  async submitFeedback(input: FeedbackInput): Promise<FeedbackResult> {
    // 允许未登录反馈（服务端 reporter 可为 null）；但已登录则自动带身份去重
    try {
      const { error } = await this.db.rpc('submit_feedback', {
        p_item_id: input.itemId,
        p_type: input.type,
        p_suggested_price: input.suggestedPrice ?? null,
        p_reason: input.reason,
      })
      if (error) throw error
      return { ok: true }
    } catch (e) {
      throw toRepoError('反馈提交', e)
    }
  }
}
