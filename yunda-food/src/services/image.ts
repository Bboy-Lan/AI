import {
  IMAGE_POLICY, QUALITY_STEPS,
  scaledSize, targetLongEdge, sourceRejection, extensionForType, isHeicLike, isGenericType,
  withinHardLimit, withinTarget, classifyImageError, IMAGE_ERROR_HINT,
  type ImagePurpose,
} from '../domain/image-policy'

export type PreparedImage = {
  blob: Blob
  width: number
  height: number
  type: string
  extension: string
  bytes: number
  purpose: ImagePurpose
  reencoded: boolean
  quality: number
  rounds: number
}

// One decode/encode at a time: several 2048px canvases in parallel is what exhausts phone memory.
const MAX_CONCURRENT = 1
let active = 0
const waiting: (() => void)[] = []
function acquire() {
  if (active < MAX_CONCURRENT) { active += 1; return Promise.resolve() }
  return new Promise<void>(resolve => waiting.push(() => { active += 1; resolve() }))
}
function release() {
  active = Math.max(0, active - 1)
  const next = waiting.shift()
  if (next) next()
}
export function queueImageTask<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    void (async () => {
      await acquire()
      try { resolve(await task()) } catch (error) { reject(error) } finally { release() }
    })()
  })
}

async function decodeWithElement(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = url
    await new Promise<void>((resolve, reject) => {
      if (image.complete && image.naturalWidth) { resolve(); return }
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('图片解码失败。'))
    })
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('图片解码失败。')
    return image
  } finally {
    // Keep the element alive but drop the object URL; the bitmap is already decoded.
    URL.revokeObjectURL(url)
  }
}

async function convertHeic(file: Blob): Promise<Blob> {
  const module = await import('heic2any')
  const convert = (module as unknown as { default: (options: Record<string, unknown>) => Promise<Blob | Blob[]> }).default || (module as unknown as (options: Record<string, unknown>) => Promise<Blob | Blob[]>)
  const result = await convert({ blob: file, toType: 'image/jpeg', quality: 0.92, multiple: false })
  const blob = Array.isArray(result) ? result[0] : result
  if (!blob || !blob.size) throw new Error('这张 HEIC 照片无法解码。')
  return blob
}

async function decodeImage(file: File, allowHeic: boolean): Promise<{ source: CanvasImageSource, width: number, height: number, release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close?.() }
    } catch { /* fall through to <img> decoding */ }
  }
  try {
    const image = await decodeWithElement(file)
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => { image.src = '' } }
  } catch (error) {
    if (!allowHeic || !isHeicLike(file)) throw new Error(IMAGE_ERROR_HINT.decode)
    const converted = await convertHeic(file)
    return decodeImage(new File([converted], String((file as File).name || 'photo').replace(/\.(heic|heif)$/i, '.jpg'), { type: converted.type || 'image/jpeg' }), false)
  }
}

function draw(source: CanvasImageSource, width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, width)
  canvas.height = Math.max(1, height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器无法创建图片画布，请换一个浏览器重试。')
  // White base: a JPEG fallback cannot keep transparency, and dark text screenshots stay readable.
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>(resolve => {
    try { canvas.toBlob(blob => resolve(blob), type, quality) } catch { resolve(null) }
  })
}

function releaseCanvas(canvas: HTMLCanvasElement) { canvas.width = 0; canvas.height = 0 }

// Encoding must follow what the browser actually produced: Safari may ignore WebP or fall back to PNG.
async function encodeCanvas(canvas: HTMLCanvasElement, purpose: ImagePurpose, quality: number): Promise<Blob | null> {
  const order = purpose === 'evidence' ? ['image/png', 'image/webp', 'image/jpeg'] : ['image/webp', 'image/jpeg', 'image/png']
  let best: Blob | null = null
  for (const type of order) {
    const blob = await toBlob(canvas, type, quality)
    if (!blob || !blob.size) continue
    // A browser that cannot encode the requested type silently returns PNG.
    if (blob.type && blob.type !== type && type !== 'image/png') {
      if (!best || blob.size < best.size) best = blob
      continue
    }
    if (!best || blob.size < best.size) best = blob
    if (!blob.type || blob.type === type) return blob
  }
  return best
}

export function prepareImage(file: File, purpose: ImagePurpose = 'photo'): Promise<PreparedImage> {
  return queueImageTask(async () => {
    const rejected = sourceRejection(file.size, 0, purpose)
    if (rejected) throw new Error(rejected)
    let decoded: Awaited<ReturnType<typeof decodeImage>> | undefined
    try {
      decoded = await decodeImage(file, true)
      const pixels = decoded.width * decoded.height
      const pixelRejected = sourceRejection(0, pixels, purpose)
      if (pixelRejected) throw new Error(pixelRejected)
      const longEdge = targetLongEdge(purpose, decoded.width, decoded.height)
      let scale = Math.min(1, longEdge / Math.max(decoded.width, decoded.height))
      let best: Blob | undefined
      let bestQuality: number = QUALITY_STEPS[0]
      let bestSize = { width: decoded.width, height: decoded.height }
      let rounds = 0
      for (let round = 0; round < 4; round += 1) {
        rounds = round + 1
        const size = scaledSize(decoded.width * scale, decoded.height * scale, Math.round(longEdge * scale))
        const canvas = draw(decoded.source, size.width, size.height)
        try {
          for (const quality of QUALITY_STEPS) {
            const blob = await encodeCanvas(canvas, purpose, quality)
            if (!blob) continue
            if (!best || blob.size < best.size) { best = blob; bestQuality = quality; bestSize = size }
            if (withinTarget(blob.size, purpose)) {
              return finish(blob, size.width, size.height, purpose, quality, rounds)
            }
          }
        } finally { releaseCanvas(canvas) }
        if (best && withinTarget(best.size, purpose)) break
        if (round < 3) scale *= 0.8
      }
      if (!best) throw new Error('图片编码失败，请换一张图片重试。')
      if (!withinHardLimit(best.size, purpose)) {
        throw new Error(`处理后仍有 ${(best.size / 1024 / 1024).toFixed(1)}MB，超过 ${Math.round(IMAGE_POLICY[purpose].hardBytes / 1024 / 1024)}MB 上限，请裁切后重试。`)
      }
      return finish(best, bestSize.width, bestSize.height, purpose, bestQuality, rounds)
    } catch (error) {
      const kind = classifyImageError(error)
      if ((error as Error)?.message && kind !== 'unknown') throw error
      throw new Error(IMAGE_ERROR_HINT[kind === 'unknown' ? 'decode' : kind])
    } finally {
      decoded?.release()
    }
  })
}

function finish(blob: Blob, width: number, height: number, purpose: ImagePurpose, quality: number, rounds: number): PreparedImage {
  const type = blob.type || (purpose === 'evidence' ? 'image/png' : 'image/jpeg')
  return {
    blob, width, height, type,
    extension: extensionForType(type, 'jpg'),
    bytes: blob.size, purpose,
    reencoded: true, quality, rounds,
  }
}

export function genericTypeNotice(type: string) {
  return isGenericType(type)
}
