import type {
  AuthorInfo,
  FeedbackInput,
  FeedbackResult,
  FoodItem,
  MyProfileStatus,
  MyReview,
  RepoState,
  Review,
  SubmissionInput,
  SubmissionResult,
  UpdateSubmissionInput,
} from '../types'
import { RepoError } from '../types'
import { SAMPLE_ITEMS } from '../data/seed'
import type { FoodRepository } from './repo'
import { KEYS, readJSON, writeJSON } from './storage'

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function toItem(input: SubmissionInput, id: string, status: FoodItem['status'], submittedAt: string): FoodItem {
  return {
    id,
    name: input.name,
    category: input.category,
    venue: input.venue,
    areaId: input.areaId,
    campusId: input.campusId,
    priceMode: input.priceMode,
    price: input.price,
    spicy: input.spicy,
    sweetSalty: input.sweetSalty,
    oil: input.oil,
    staple: input.staple,
    flavors: input.flavors,
    cuisine: null,
    description: input.description,
    image: input.image ?? null,
    source: 'user',
    status,
    submittedAt,
    priceUpdatedAt: submittedAt.slice(0, 10),
    author: {
      nickname: input.author.nickname,
      hometown: input.author.hometown ?? null,
      ate: input.author.ate,
      ateDate: input.author.ateDate ?? null,
    } satisfies AuthorInfo,
    ratingCount: 0,
    ratingAvg: null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
  }
}

// 无服务端时的实现：示例数据 + localStorage 本机草稿。
// 本机草稿在任何界面都必须显示“仅本机可见”，不得伪装成发布成功。
export class LocalRepo implements FoodRepository {
  readonly mode = 'local' as const

  getState(): RepoState {
    return 'local'
  }
  getLastError(): string | null {
    return null
  }
  subscribe(): () => void {
    return () => {}
  }
  async checkConnection(): Promise<boolean> {
    return true
  }

  private readDrafts(): FoodItem[] {
    return readJSON<FoodItem[]>(KEYS.drafts, [])
  }

  async listItems(): Promise<FoodItem[]> {
    const drafts = this.readDrafts()
    return [...drafts, ...SAMPLE_ITEMS]
  }
  async refreshItems(): Promise<FoodItem[]> { return this.listItems() }

  async getItem(id: string): Promise<FoodItem | null> {
    const all = await this.listItems()
    return all.find((i) => i.id === id) ?? null
  }

  async listMyItems(): Promise<FoodItem[]> {
    // 本地模式没有云端身份，本机草稿即“我的发布”
    return this.readDrafts()
  }

  invalidateItems(): void {
    // localStorage 直读直写，无需缓存失效
  }

  async submit(input: SubmissionInput): Promise<SubmissionResult> {
    const item = toItem(input, uid('local'), 'local-draft', new Date().toISOString())
    const drafts = this.readDrafts()
    drafts.unshift(item)
    writeJSON(KEYS.drafts, drafts)
    return {
      ok: false,
      savedDraft: true,
      item,
      message: '已保存在本机草稿。当前还没接通共享数据库，其他手机暂时看不到它。',
      retryable: false,
    }
  }

  async updateMyItem(input: UpdateSubmissionInput): Promise<FoodItem> {
    const drafts = this.readDrafts()
    const index = drafts.findIndex((item) => item.id === input.id)
    if (index < 0) throw new RepoError('只能编辑当前浏览器保存的本机草稿。', 'item_not_found', false)
    const previous = drafts[index]
    const item: FoodItem = {
      ...previous,
      ...input,
      image: input.image ?? previous.image,
      latitude: input.latitude ?? previous.latitude ?? null,
      longitude: input.longitude ?? previous.longitude ?? null,
      priceUpdatedAt: input.price !== previous.price ? new Date().toISOString().slice(0, 10) : previous.priceUpdatedAt,
      author: previous.author,
    }
    drafts[index] = item
    writeJSON(KEYS.drafts, drafts)
    return item
  }

  private readReviews(): Review[] {
    return readJSON<Review[]>(KEYS.reviews, [])
  }

  async listReviews(_itemId: string): Promise<Review[]> {
    return this.readReviews()
      .filter((r) => r.itemId === _itemId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async hasOwnRating(itemId: string): Promise<boolean> {
    const map = readJSON<Record<string, Review>>(KEYS.ownRatings, {})
    return Boolean(map[itemId])
  }

  async getOwnReview(itemId: string): Promise<MyReview | null> {
    const map = readJSON<Record<string, Review>>(KEYS.ownRatings, {})
    const review = map[itemId]
    return review ? { ...review, moderationStatus: 'published', itemStatus: 'published' } : null
  }

  async addReview(input: Omit<Review, 'id' | 'createdAt'>): Promise<Review> {
    const all = this.readReviews()
    const own = readJSON<Record<string, Review>>(KEYS.ownRatings, {})
    const existing = own[input.itemId]
    let saved: Review
    if (existing) {
      saved = { ...existing, ...input }
      const idx = all.findIndex((r) => r.id === existing.id)
      if (idx >= 0) all[idx] = saved
      else all.push(saved)
    } else {
      saved = { ...input, id: uid('rev'), createdAt: new Date().toISOString() }
      all.push(saved)
    }
    writeJSON(KEYS.reviews, all)
    own[input.itemId] = saved
    writeJSON(KEYS.ownRatings, own)
    return saved
  }

  async submitFeedback(_input: FeedbackInput): Promise<FeedbackResult> {
    // 本地模式没有云端待处理队列：明确报错，不假成功
    throw new RepoError('当前是示例模式，还没接通共享数据库，反馈无法送达。配置云端后即可提交。', 'local_mode', false)
  }

  async saveIdentity(): Promise<void> {
    // 本地模式只会由 ProfileProvider 保存本机偏好，不能伪装成云端身份。
  }
  async listFavoriteIds(): Promise<string[]> { return readJSON<string[]>(KEYS.favorites, []) }
  async toggleFavorite(itemId: string): Promise<boolean> {
    const ids = await this.listFavoriteIds()
    const next = ids.includes(itemId) ? ids.filter((id) => id !== itemId) : [...ids, itemId]
    writeJSON(KEYS.favorites, next)
    return next.includes(itemId)
  }
  async listMyReviews(): Promise<MyReview[]> {
    return this.readReviews().map((review) => ({ ...review, moderationStatus: 'published', itemStatus: 'published' }))
  }
  async getMyProfileStatus(): Promise<MyProfileStatus> { return { restricted: false } }
  async isAdmin(): Promise<boolean> { return false }
  async getCurrentUserId(): Promise<string | null> { return null }
  async listAdminItems(): Promise<FoodItem[]> {
    throw new RepoError('内容管理需要接通共享数据库。', 'local_mode', false)
  }
  async setItemVisibility(): Promise<void> {
    throw new RepoError('内容管理需要接通共享数据库。', 'local_mode', false)
  }
  async getAdminOverview(): Promise<never> { throw new RepoError('内容管理需要接通共享数据库。', 'local_mode', false) }
  async listAdminReviews(): Promise<never> { throw new RepoError('内容管理需要接通共享数据库。', 'local_mode', false) }
  async setReviewVisibility(): Promise<never> { throw new RepoError('内容管理需要接通共享数据库。', 'local_mode', false) }
  async listAdminProfiles(): Promise<never> { throw new RepoError('内容管理需要接通共享数据库。', 'local_mode', false) }
  async setProfileRestriction(): Promise<never> { throw new RepoError('内容管理需要接通共享数据库。', 'local_mode', false) }
  async grantAdminDevice(): Promise<never> { throw new RepoError('内容管理需要接通共享数据库。', 'local_mode', false) }
  async listHiddenSampleIds(): Promise<string[]> { return [] }
  async setSampleVisibility(): Promise<never> { throw new RepoError('内容管理需要接通共享数据库。', 'local_mode', false) }
}
