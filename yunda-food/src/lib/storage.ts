// localStorage 只允许存放：口味画像、收藏、本机草稿/本机评价。
// 正式投稿与图片必须走服务端（见 repo.ts / supabaseRepo.ts）。

export const KEYS = {
  profile: 'yffd:profile:v1',
  favorites: 'yffd:favorites:v1',
  drafts: 'yffd:drafts:v1',
  reviews: 'yffd:reviews:v1',
  ownRatings: 'yffd:own-ratings:v1', // 同一浏览器对同一投稿只保存一份评分
}

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 配额超限时静默失败，由调用方给用户提示
  }
}
