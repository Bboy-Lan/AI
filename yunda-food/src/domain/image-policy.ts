// Pure image policy shared by the browser pipeline and node tests.
// Kept free of DOM APIs so the rules can be verified without a browser.
export type ImagePurpose = 'avatar' | 'photo' | 'evidence'

export type ImagePolicy = {
  label: string
  maxLongEdge: number
  longShotLongEdge: number
  targetBytes: number
  hardBytes: number
  preferLossless: boolean
}

export const IMAGE_POLICY: Record<ImagePurpose, ImagePolicy> = {
  avatar: { label: '头像', maxLongEdge: 768, longShotLongEdge: 768, targetBytes: 320 * 1024, hardBytes: 900 * 1024, preferLossless: false },
  photo: { label: '照片', maxLongEdge: 2048, longShotLongEdge: 2560, targetBytes: 1.6 * 1024 * 1024, hardBytes: 4 * 1024 * 1024, preferLossless: false },
  // Screenshots and receipts keep text readable: a higher ceiling and PNG-first encoding.
  evidence: { label: '截图', maxLongEdge: 3000, longShotLongEdge: 4096, targetBytes: 2.4 * 1024 * 1024, hardBytes: 5 * 1024 * 1024, preferLossless: true },
}

export const SOURCE_MAX_BYTES = 40 * 1024 * 1024
export const SOURCE_MAX_PIXELS = 60_000_000
export const QUALITY_STEPS = [0.85, 0.72, 0.6, 0.5] as const
export const DOWNSCALE_STEPS = [0.85, 0.7] as const
export const LONG_SHOT_RATIO = 3

const MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/avif': 'avif',
  'image/gif': 'gif',
}

export function extensionForType(type: string, fallback = 'jpg') {
  const normalized = String(type || '').toLowerCase().split(';')[0].trim()
  return MIME_EXTENSION[normalized] || fallback
}

export function isHeicLike(file: { type?: string, name?: string }) {
  const type = String(file.type || '').toLowerCase()
  if (type === 'image/heic' || type === 'image/heif' || type === 'image/heic-sequence' || type === 'image/heif-sequence') return true
  // Some Apple uploads arrive with an empty or generic type; the suffix is the only hint left.
  if (type && type !== 'application/octet-stream') return false
  return /\.(heic|heif)$/i.test(String(file.name || ''))
}

export function isGenericType(type: string) {
  const value = String(type || '').toLowerCase()
  return !value || value === 'application/octet-stream' || value === 'binary/octet-stream'
}

export function scaledSize(width: number, height: number, maxLongEdge: number) {
  const w = Math.max(0, Math.round(width))
  const h = Math.max(0, Math.round(height))
  if (!w || !h || !maxLongEdge) return { width: Math.max(1, w), height: Math.max(1, h) }
  const longEdge = Math.max(w, h)
  if (longEdge <= maxLongEdge) return { width: w, height: h } // never upscale
  const ratio = maxLongEdge / longEdge
  return { width: Math.max(1, Math.round(w * ratio)), height: Math.max(1, Math.round(h * ratio)) }
}

export function targetLongEdge(purpose: ImagePurpose, width: number, height: number) {
  const policy = IMAGE_POLICY[purpose]
  const ratio = Math.max(width, height) / Math.max(1, Math.min(width, height))
  return ratio >= LONG_SHOT_RATIO ? policy.longShotLongEdge : policy.maxLongEdge
}

export function sourceRejection(bytes: number, pixels: number, purpose: ImagePurpose = 'photo') {
  if (bytes > SOURCE_MAX_BYTES) return `原图超过 ${Math.round(SOURCE_MAX_BYTES / 1024 / 1024)}MB，请换一张更小的${IMAGE_POLICY[purpose].label}。`
  if (pixels > SOURCE_MAX_PIXELS) return '图片像素过大，手机无法安全处理，请换一张或先在相册裁切后重试。'
  return ''
}

export function nextQuality(current?: number) {
  if (current == null) return QUALITY_STEPS[0]
  const index = QUALITY_STEPS.indexOf(current as (typeof QUALITY_STEPS)[number])
  return index >= 0 && index + 1 < QUALITY_STEPS.length ? QUALITY_STEPS[index + 1] : undefined
}

export function nextScale(current: number) {
  const step = DOWNSCALE_STEPS.find(value => value < current - 0.001)
  return step
}

export function withinHardLimit(bytes: number, purpose: ImagePurpose) {
  return bytes <= IMAGE_POLICY[purpose].hardBytes
}

export function withinTarget(bytes: number, purpose: ImagePurpose) {
  return bytes <= IMAGE_POLICY[purpose].targetBytes
}

export type ImageErrorKind = 'format' | 'decode' | 'size' | 'network' | 'quota' | 'auth' | 'unknown'

export function classifyImageError(error: unknown): ImageErrorKind {
  const message = String((error as Error)?.message ?? error ?? '')
  if (/配额|空间不足|quota|exceed/i.test(message)) return 'quota'
  if (/超出|超过|过大|上限/.test(message)) return 'size'
  if (/格式|不支持|HEIC|HEIF|解码|decode|corrupt|损坏/i.test(message)) return 'decode'
  if (/登录|会话|权限|auth|401|403/i.test(message)) return 'auth'
  if (/网络|超时|timeout|network|fetch|连接/i.test(message)) return 'network'
  return 'unknown'
}

export const IMAGE_ERROR_HINT: Record<ImageErrorKind, string> = {
  format: '这张图片的格式暂时无法处理，请在相册里另存为 JPG 后重试。',
  decode: '这张图片解码失败，可能已损坏；可以换一张，或先截图再上传。',
  size: '图片处理后仍然偏大，请裁切或换一张更小的图片。',
  network: '网络中断导致上传失败，已保留其他成功的照片，可直接重试这一张。',
  quota: '云端空间不足或超出配额，请稍后重试或联系管理员。',
  auth: '登录状态已失效，请重新登录后重试，正文内容不会丢失。',
  unknown: '图片处理未完成，请重试；如果反复失败，可以换一张图片。',
}

export function imageErrorText(error: unknown) {
  const message = String((error as Error)?.message ?? '').trim()
  if (message) return message
  return IMAGE_ERROR_HINT[classifyImageError(error)]
}
