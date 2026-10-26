import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import type {
  AuthorInfo,
  AdminOverview,
  AdminProfile,
  AdminReview,
  FeedbackInput,
  FeedbackResult,
  FoodItem,
  MyProfileStatus,
  MyReview,
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
    status: (row.status as FoodItem['status']) ?? 'published',
    submittedAt: str(row.submitted_at),
    priceUpdatedAt: (row.price_updated_at as string | null) ?? null,
    author,
    ratingCount: Number(row.rating_count ?? 0),
    ratingAvg: row.rating_avg == null ? null : Number(row.rating_avg),
    favoriteCount: Number(row.favorite_count ?? 0),
    verification: {
      status: row.verification_status === 'verified' ? 'verified' : 'pending',
      positive: Number(row.verification_positive_count ?? 0),
      negative: Number(row.verification_negative_count ?? 0),
      total: Number(row.verification_rating_count ?? 0),
    },
    placeId: (row.place_id as string | null) ?? null,
    placeKey: (row.place_key as string | null) ?? null,
    latitude: row.lat == null ? null : Number(row.lat),
    longitude: row.lng == null ? null : Number(row.lng),
    addressSummary: (row.address_summary as string | null) ?? null,
    hiddenReason: (row.hidden_reason as string | null) ?? null,
    hiddenAt: (row.hidden_at as string | null) ?? null,
  }
}

// 只选择展示列，owner 等内部列不请求
const ITEM_COLUMNS =
  'id,name,category,venue,area_id,campus_id,price_mode,price,spicy,sweet_salty,oil,staple,flavors,cuisine,description,image,source,status,submitted_at,price_updated_at,author_nickname,author_hometown,author_ate,author_ate_date,rating_count,rating_avg,favorite_count,verification_status,verification_positive_count,verification_negative_count,verification_rating_count,place_id,place_key,lat,lng,address_summary'
const LEGACY_ITEM_COLUMNS =
  'id,name,category,venue,area_id,campus_id,price_mode,price,spicy,sweet_salty,oil,staple,flavors,cuisine,description,image,source,status,submitted_at,price_updated_at,author_nickname,author_hometown,author_ate,author_ate_date,rating_count,rating_avg'

const REVIEW_COLUMNS = 'id,item_id,nickname,rating,text,ate_date,created_at'

/** 把 PostgREST/Auth/Storage 错误翻译为可操作提示 */
function toRepoError(where: string, err: unknown): RepoErrorType {
  const anyErr = err as { message?: string; code?: string; status?: number; name?: string } | null
  const message = anyErr?.message ?? '未知网络错误'
  const code = anyErr?.code ?? String(anyErr?.status ?? '')

  if (message === 'profile_restricted' || /profile_restricted/i.test(message)) {
    return new RepoError('当前身份已被限制发布投稿和评论。请到“我的”查看处理说明；浏览、收藏和修改资料仍可使用。', 'profile_restricted', false)
  }
  if (message === 'location_outside_kunming' || /location_outside_kunming/i.test(message)) {
    return new RepoError('投稿地点仅支持昆明市内的预设地点，请重新选择。', 'location_outside_kunming', false)
  }

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
  private remoteCache: FoodItem[] | null = null
  private hiddenSampleIds = new Set<string>()
  private inflightList: Promise<FoodItem[]> | null = null
  private requestVersion = 0

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

  invalidateItems(): void {
    this.remoteCache = null
    this.inflightList = null
  }

  private async fetchRemote(version: number): Promise<FoodItem[]> {
    // 每轮同步先探测完整 schema：数据库迁移完成后，已打开的旧会话也会
    // 自动恢复核验/想吃字段，而不必要求用户手动硬刷新。
    const initial = await this.db
      .from('food_items')
      .select(ITEM_COLUMNS)
      .eq('status', 'published')
      .order('submitted_at', { ascending: false })
    let data = initial.data as unknown as Row[] | null
    let error = initial.error
    // v3 尚未执行时，保留旧云端只读浏览，不把“新增字段不存在”伪装成无数据。
    if (error && /favorite_count|verification_status|place_key|does not exist|schema cache/i.test(error.message ?? '')) {
      const retry = await this.db.from('food_items').select(LEGACY_ITEM_COLUMNS).eq('status', 'published').order('submitted_at', { ascending: false })
      data = retry.data as unknown as Row[] | null
      error = retry.error
    }
    if (error) {
      const re = toRepoError('读取投稿', error)
      if (version === this.requestVersion) this.setState('offline', re.message)
      throw re
    }
    const remote = (data ?? []).map((r) => mapItem(r))
    if (version === this.requestVersion) {
      this.setState('online')
      this.remoteCache = remote
    }
    return remote
  }

  private async visibleSamples(): Promise<FoodItem[]> {
    try {
      const { data, error } = await this.db.rpc('hidden_sample_ids')
      if (error) throw error
      this.hiddenSampleIds = new Set(Array.isArray(data) ? data.map(String) : [])
    } catch {
      // 管理员已隐藏过的示例不能因网络故障或迁移缺失重新露出。
      // 远端状态无法确认时宁可暂不展示示例，也不回退到“全部可见”。
      this.hiddenSampleIds = new Set(SAMPLE_ITEMS.map((item) => item.id))
    }
    return SAMPLE_ITEMS.filter((item) => !this.hiddenSampleIds.has(item.id))
  }

  async listItems(): Promise<FoodItem[]> {
    if (this.remoteCache) return [...this.remoteCache, ...(await this.visibleSamples())]
    if (this.inflightList) return this.inflightList.then(async (remote) => [...remote, ...(await this.visibleSamples())])
    const request = this.fetchRemote(++this.requestVersion)
    this.inflightList = request
    try {
      const remote = await request
      return [...remote, ...(await this.visibleSamples())]
    } finally {
      if (this.inflightList === request) this.inflightList = null
    }
  }
  async refreshItems(): Promise<FoodItem[]> {
    const remote = await this.fetchRemote(++this.requestVersion)
    return [...remote, ...(await this.visibleSamples())]
  }

  async listMyItems(): Promise<FoodItem[]> {
    const { data: sess } = await this.db.auth.getSession()
    if (!sess.session) return []
    const { data, error } = await this.db.rpc('my_food_items')
    if (error) throw toRepoError('读取我的投稿', error)
    const rows = (Array.isArray(data) ? data : []) as Row[]
    return rows.map((r) => mapItem(r))
  }

  async getItem(id: string): Promise<FoodItem | null> {
    if (SAMPLE_ITEMS.some((s) => s.id === id)) {
      return (await this.visibleSamples()).find((s) => s.id === id) ?? null
    }
    if (!isUuidId(id)) return null
    // 优先用缓存，保证发布成功后立刻跳转详情时能看到最新数据
    if (this.remoteCache) {
      const hit = this.remoteCache.find((i) => i.id === id)
      if (hit) return hit
    }
    const initial = await this.db
      .from('food_items')
      .select(ITEM_COLUMNS)
      .eq('id', id)
      .maybeSingle()
    let data = initial.data as unknown as Row | null
    let error = initial.error
    if (error && /favorite_count|verification_status|place_key|does not exist|schema cache/i.test(error.message ?? '')) {
      const retry = await this.db.from('food_items').select(LEGACY_ITEM_COLUMNS).eq('id', id).maybeSingle()
      data = retry.data as unknown as Row | null
      error = retry.error
    }
    if (error) throw toRepoError('读取详情', error)
    return data ? mapItem(data) : null
  }

  /** 上传到仅属于当前匿名身份的目录；服务端策略会再次校验路径与类型 */
  private async uploadImage(uid: string, image: string): Promise<{ url: string; path: string | null }> {
    if (!image.startsWith('data:')) return { url: image, path: null } // 已是远程 URL（理论上当前投稿只产生 dataURL）
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
    return { url: data.publicUrl, path }
  }

  async submit(input: SubmissionInput): Promise<SubmissionResult> {
    let session: Session
    let uploadedPath: string | null = null
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
      const moderation = await this.getMyProfileStatus()
      if (moderation.restricted) {
        throw new RepoError(`当前身份已被限制发布投稿${moderation.reason ? `：${moderation.reason}` : '。请到“我的”查看处理说明。'}`, 'profile_restricted', false)
      }
      // 先传图，再写库：写库失败只会留下孤儿图片，不会产生无图/重复投稿
      const uploaded = input.image ? await this.uploadImage(session.user.id, input.image) : null
      uploadedPath = uploaded?.path ?? null
      const { data, error } = await this.db.rpc('submit_food_item_v3', {
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
        p_cuisine: '',
        p_description: input.description,
        p_image: uploaded?.url ?? '',
        p_place_id: null,
        p_lat: null,
        p_lng: null,
        p_address_summary: null,
      })
      if (error) throw toRepoError('投稿保存', error)
      const item = mapItem((data ?? {}) as Row)
      if (!item.id) throw new RepoError('投稿已发送但没拿到记录，请刷新列表确认', 'no_return')
      // 立即更新缓存，保证发布后列表/详情/我的页马上能看到，无需手动刷新
      this.remoteCache = [item, ...(this.remoteCache ?? [])]
      this.setState('online')
      return { ok: true, item, savedRemotely: true }
    } catch (e) {
      if (uploadedPath) {
        // 数据库写入失败时，回收本次刚上传且仍属于当前身份的图片，避免形成公开孤儿文件。
        await this.db.storage.from('food-photos').remove([uploadedPath]).catch(() => undefined)
      }
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
    // 起始示例使用 s01/s02 等本地 ID，不属于云端 UUID 评论表；示例不提供真实评论。
    if (SAMPLE_ITEMS.some((item) => item.id === itemId) || !isUuidId(itemId)) return []
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
    const own = await this.getOwnReview(itemId)
    return Boolean(own)
  }

  async getOwnReview(itemId: string): Promise<MyReview | null> {
    if (!isUuidId(itemId)) return null
    const { data: sess } = await this.db.auth.getSession()
    if (!sess.session) return null
    const { data, error } = await this.db.rpc('my_review', { p_item_id: itemId })
    if (error) throw toRepoError('读取我的评分', error)
    if (!data) return null
    const r = data as Row
    return {
      ...this.mapReview(r),
      moderationStatus: r.moderation_status === 'hidden' ? 'hidden' : 'published',
      moderationReason: (r.moderation_reason as string | null) ?? null,
      itemStatus: r.item_status === 'hidden' ? 'hidden' : 'published',
      itemName: str(r.item_name),
    }
  }

  async addReview(input: Omit<Review, 'id' | 'createdAt'>): Promise<Review> {
    if (SAMPLE_ITEMS.some((s) => s.id === input.itemId)) {
      throw new RepoError('示例内容不能提交真实云端评分，它不是云大现场投稿。', 'sample_review', false)
    }
    await this.ensureSession()
    const { data, error } = await this.db.rpc('submit_review_v3', {
      p_item_id: input.itemId,
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

  async saveIdentity(input: { foodieId: string; hometown: string | null; defaultArea: string | null; tastes: Record<string, unknown> }): Promise<void> {
    await this.ensureSession()
    const { error } = await this.db.rpc('upsert_my_profile', {
      p_foodie_id: input.foodieId,
      p_hometown: input.hometown ?? '',
      p_taste_preferences: input.tastes,
      p_default_area_id: input.defaultArea ?? '',
    })
    if (error) throw toRepoError('保存吃货 ID', error)
  }

  async listFavoriteIds(): Promise<string[]> {
    const { data: sess } = await this.db.auth.getSession()
    if (!sess.session) return []
    const { data, error } = await this.db.rpc('my_favorite_ids')
    if (error) throw toRepoError('读取想吃清单', error)
    return Array.isArray(data) ? data.map(String) : []
  }

  async toggleFavorite(itemId: string): Promise<boolean> {
    await this.ensureSession()
    const { data, error } = await this.db.rpc('toggle_favorite', { p_item_id: itemId })
    if (error) throw toRepoError('更新想吃', error)
    return Boolean((data as { saved?: boolean } | null)?.saved)
  }

  async listMyReviews(): Promise<MyReview[]> {
    const { data: sess } = await this.db.auth.getSession()
    if (!sess.session) return []
    const { data, error } = await this.db.rpc('my_reviews')
    if (error) throw toRepoError('读取我的评论', error)
    return (Array.isArray(data) ? data : []).map((row) => {
      const r = row as Row
      return {
        ...this.mapReview(r),
        moderationStatus: r.moderation_status === 'hidden' ? 'hidden' : 'published',
        moderationReason: (r.moderation_reason as string | null) ?? null,
        itemStatus: r.item_status === 'hidden' ? 'hidden' : 'published',
        itemName: str(r.item_name),
      }
    })
  }

  async getMyProfileStatus(): Promise<MyProfileStatus> {
    const { data: sess } = await this.db.auth.getSession()
    if (!sess.session) return { restricted: false }
    const { data, error } = await this.db.rpc('my_profile')
    if (error) throw toRepoError('读取我的账户状态', error)
    const row = (data ?? {}) as Row
    return {
      restricted: row.moderation_status === 'restricted',
      reason: (row.moderation_reason as string | null) ?? null,
      moderatedAt: (row.moderated_at as string | null) ?? null,
    }
  }

  async isAdmin(): Promise<boolean> {
    const { data, error } = await this.db.rpc('is_admin')
    if (error) throw toRepoError('核验管理员权限', error)
    return data === true
  }

  async getCurrentUserId(): Promise<string | null> {
    const { data } = await this.db.auth.getSession()
    return data.session?.user.id ?? null
  }

  async listAdminItems(includeHidden: boolean): Promise<FoodItem[]> {
    const { data, error } = await this.db.rpc('admin_list_items', { p_include_hidden: includeHidden })
    if (error) throw toRepoError('读取内容管理列表', error)
    return (Array.isArray(data) ? data : []).map((row) => mapItem(row as Row))
  }

  async setItemVisibility(input: { itemId: string; hidden: boolean; reason?: string }): Promise<void> {
    const { error } = await this.db.rpc('admin_set_item_visibility', {
      p_item_id: input.itemId,
      p_hidden: input.hidden,
      p_reason: input.reason?.trim() || null,
    })
    if (error) throw toRepoError(input.hidden ? '下架投稿' : '恢复投稿', error)
  }


  async getAdminOverview(): Promise<AdminOverview> {
    const { data, error } = await this.db.rpc('admin_moderation_overview')
    if (error) throw toRepoError('读取管理概览', error)
    const row = (data ?? {}) as Row
    return {
      profileCount: Number(row.profile_count ?? 0),
      publishedItemCount: Number(row.published_item_count ?? 0),
      hiddenItemCount: Number(row.hidden_item_count ?? 0),
      publishedReviewCount: Number(row.published_review_count ?? 0),
      hiddenReviewCount: Number(row.hidden_review_count ?? 0),
    }
  }

  async listAdminReviews(includeHidden: boolean): Promise<AdminReview[]> {
    const { data, error } = await this.db.rpc('admin_list_reviews', { p_include_hidden: includeHidden })
    if (error) throw toRepoError('读取评论审核列表', error)
    return (Array.isArray(data) ? data : []).map((row) => {
      const r = row as Row
      return {
        ...this.mapReview(r),
        itemName: str(r.item_name),
        moderationStatus: r.moderation_status === 'hidden' ? 'hidden' : 'published',
        moderationReason: (r.moderation_reason as string | null) ?? null,
      }
    })
  }

  async setReviewVisibility(input: { reviewId: string; hidden: boolean; reason?: string }): Promise<void> {
    const { error } = await this.db.rpc('admin_set_review_visibility', {
      p_review_id: input.reviewId,
      p_hidden: input.hidden,
      p_reason: input.reason?.trim() || null,
    })
    if (error) throw toRepoError(input.hidden ? '隐藏评论' : '恢复评论', error)
  }

  async listAdminProfiles(): Promise<AdminProfile[]> {
    const { data, error } = await this.db.rpc('admin_list_profiles')
    if (error) throw toRepoError('读取用户群体', error)
    return (Array.isArray(data) ? data : []).map((row) => {
      const r = row as Row
      return {
        userId: str(r.user_id),
        foodieId: str(r.foodie_id),
        hometown: (r.hometown as string | null) ?? null,
        defaultArea: (r.default_area_id as string | null) ?? null,
        createdAt: str(r.created_at),
        itemCount: Number(r.item_count ?? 0),
        reviewCount: Number(r.review_count ?? 0),
        restricted: r.moderation_status === 'restricted',
        restrictionReason: (r.moderation_reason as string | null) ?? null,
      }
    })
  }

  async setProfileRestriction(input: { userId: string; restricted: boolean; reason?: string }): Promise<void> {
    if (!isUuidId(input.userId)) throw new RepoError('用户身份格式不正确。', 'invalid_user', false)
    const { error } = await this.db.rpc('admin_set_profile_restriction', {
      p_user_id: input.userId,
      p_restricted: input.restricted,
      p_reason: input.reason?.trim() || null,
    })
    if (error) throw toRepoError(input.restricted ? '限制用户内容发布' : '解除用户限制', error)
  }

  async grantAdminDevice(userId: string): Promise<void> {
    if (!isUuidId(userId)) throw new RepoError('匿名设备 ID 格式不正确。', 'invalid_user', false)
    const { error } = await this.db.rpc('admin_grant_device', { p_user_id: userId })
    if (error) throw toRepoError('授权管理员浏览器', error)
  }

  async listHiddenSampleIds(): Promise<string[]> {
    const { data, error } = await this.db.rpc('hidden_sample_ids')
    if (error) throw toRepoError('读取示例可见状态', error)
    return Array.isArray(data) ? data.map(String) : []
  }

  async setSampleVisibility(input: { sampleId: string; hidden: boolean; reason?: string }): Promise<void> {
    const { error } = await this.db.rpc('admin_set_sample_visibility', { p_sample_id: input.sampleId, p_hidden: input.hidden, p_reason: input.reason?.trim() || null })
    if (error) throw toRepoError(input.hidden ? '隐藏示例' : '恢复示例', error)
  }
}
