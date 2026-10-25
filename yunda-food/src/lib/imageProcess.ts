// 投稿图片：浏览器端先压缩，再交给仓储层（本地 dataURL / 服务端上传原图压缩版）

export const MAX_SOURCE_BYTES = 8 * 1024 * 1024
const MAX_EDGE = 1280

export class ImagePickError extends Error {}

export function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new ImagePickError('只能选图片文件（JPG / PNG / WebP）'))
      return
    }
    if (file.size > MAX_SOURCE_BYTES) {
      reject(new ImagePickError('图片不能超过 8MB，先压缩或换一张'))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new ImagePickError('图片读取失败'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new ImagePickError('图片解析失败'))
      img.onload = () => {
        const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new ImagePickError('浏览器不支持图片压缩'))
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.78))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}
