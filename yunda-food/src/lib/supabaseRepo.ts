import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  AuthorInfo,
  FoodItem,
  Review,
  SubmissionInput,
  SubmissionResult,
} from '../types'
import { SAMPLE_ITEMS } from '../data/seed'
import type { FoodRepository } from './repo'
import { readJSON, writeJSON } from './storage'

// 配置 .env.local 后自动启用（见 server/supabase-schema.sql）。
// 产品不做登录：RLS 允许匿名读/投稿/评论，删除与修改仅服务端可控。

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
    source: row.source === 'sample' ? 'sample' : 'user',
    status: (row.status as FoodItem['status']) ?? 'published',
    submittedAt: str(row.submitted_at),
    priceUpdatedAt: (row.price_updated_at as string | null) ?? null,
    author,
    ratingCount: Number(row.rating_count ?? 0),
    ratingAvg: row.rating_avg == null ? null : Number(row.rating_avg),
    hasCoords: false,
  }
}

function browserId(): string {
  let id = readJSON<string>('yffd:browser-id', '')
  if (!id) {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    writeJSON('yffd:browser-id', id)
  }
  return id
}

export class SupabaseRepo implements FoodRepository {
  readonly mode = 'remote' as const
  readonly connected = true
  private db: SupabaseClient

  constructor(url: string, anonKey: string) {
    this.db = createClient(url, anonKey)
  }

  async listItems(): Promise<FoodItem[]> {
    const { data, error } = await this.db
      .from('food_items')
      .select('*')
      .eq('status', 'published')
      .order('submitted_at', { ascending: false })
    if (error) {
      // 远端异常时退回示例，保证演示可用；控制台保留错误
      console.warn('[repo] 远端读取失败，使用示例数据：', error.message)
      return SAMPLE_ITEMS
    }
    const remote = (data ?? []).map((r) => mapItem(r as Row))
    return [...remote, ...SAMPLE_ITEMS]
  }

  async getItem(id: string): Promise<FoodItem | null> {
    if (id.startsWith('s') && SAMPLE_ITEMS.some((s) => s.id === id)) {
      return SAMPLE_ITEMS.find((s) => s.id === id) ?? null
    }
    const { data, error } = await this.db.from('food_items').select('*').eq('id', id).maybeSingle()
    if (error || !data) return null
    return mapItem(data as Row)
  }

  private async uploadImage(image: string): Promise<string | null> {
    if (!image.startsWith('data:')) return image // 已是远程 URL
    const res = await fetch(image)
    const blob = await res.blob()
    const ext = blob.type.includes('png') ? 'png' : 'jpg'
    const path = `submissions/${crypto.randomUUID()}.${ext}`
    const { error } = await this.db.storage.from('food-photos').upload(path, blob, {
      contentType: blob.type,
      upsert: false,
    })
    if (error) throw new Error(`图片上传失败：${error.message}`)
    const { data } = this.db.storage.from('food-photos').getPublicUrl(path)
    return data.publicUrl
  }

  async submit(input: SubmissionInput): Promise<SubmissionResult> {
    try {
      const imageUrl = input.image ? await this.uploadImage(input.image) : null
      const payload = {
        name: input.name,
        category: input.category,
        venue: input.venue,
        area_id: input.areaId,
        campus_id: input.campusId,
        price_mode: input.priceMode,
        price: input.price,
        spicy: input.spicy,
        sweet_salty: input.sweetSalty,
        oil: input.oil,
        staple: input.staple,
        flavors: input.flavors,
        cuisine: input.cuisine ?? null,
        description: input.description,
        image: imageUrl,
        source: 'user',
        status: 'published',
        price_updated_at: new Date().toISOString().slice(0, 10),
        author_nickname: input.author.nickname,
        author_hometown: input.author.hometown ?? null,
        author_ate: input.author.ate,
        author_ate_date: input.author.ateDate ?? null,
      }
      const { data, error } = await this.db
        .from('food_items')
        .insert(payload)
        .select('*')
        .single()
      if (error || !data) throw new Error(error?.message ?? '写入失败')
      return { ok: true, item: mapItem(data as Row), savedRemotely: true }
    } catch (e) {
      return {
        ok: false,
        savedDraft: false,
        message: `服务端暂时没存上：${e instanceof Error ? e.message : '未知错误'}。请检查网络后重试。`,
      }
    }
  }

  async listReviews(itemId: string): Promise<Review[]> {
    const { data, error } = await this.db
      .from('reviews')
      .select('*')
      .eq('item_id', itemId)
      .order('created_at', { ascending: false })
    if (error || !data) return []
    return (data as Row[]).map((r) => ({
      id: str(r.id),
      itemId: str(r.item_id),
      nickname: str(r.nickname),
      rating: Number(r.rating),
      text: str(r.text),
      ateDate: str(r.ate_date),
      createdAt: str(r.created_at),
    }))
  }

  async hasOwnRating(itemId: string): Promise<boolean> {
    const { data } = await this.db
      .from('reviews')
      .select('id')
      .eq('item_id', itemId)
      .eq('browser_id', browserId())
      .maybeSingle()
    return Boolean(data)
  }

  async addReview(input: Omit<Review, 'id' | 'createdAt'>): Promise<Review> {
    // 通过 security definer RPC 写入：同浏览器覆盖旧评分，并刷新聚合分
    const { data, error } = await this.db.rpc('submit_review', {
      p_item_id: input.itemId,
      p_browser_id: browserId(),
      p_nickname: input.nickname,
      p_rating: input.rating,
      p_text: input.text,
      p_ate_date: input.ateDate,
    })
    const row = (Array.isArray(data) ? data[0] : data) as Row | null
    if (error || !row) throw new Error(error?.message ?? '评论保存失败')
    return {
      id: str(row.id),
      itemId: str(row.item_id),
      nickname: str(row.nickname),
      rating: Number(row.rating),
      text: str(row.text),
      ateDate: str(row.ate_date),
      createdAt: str(row.created_at),
    }
  }
}
