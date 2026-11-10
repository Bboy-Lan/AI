import assert from 'node:assert/strict'
import test from 'node:test'
import {
  IMAGE_POLICY, SOURCE_MAX_BYTES,
  classifyImageError, extensionForType, isHeicLike, nextQuality, nextScale,
  scaledSize, sourceRejection, targetLongEdge, withinHardLimit, withinTarget,
} from '../src/domain/image-policy'

test('头像与照片使用不同目标尺寸，截图保留更高长边', () => {
  assert.equal(IMAGE_POLICY.avatar.maxLongEdge < IMAGE_POLICY.photo.maxLongEdge, true)
  assert.equal(IMAGE_POLICY.evidence.maxLongEdge > IMAGE_POLICY.photo.maxLongEdge, true)
  assert.equal(IMAGE_POLICY.avatar.targetBytes < IMAGE_POLICY.photo.targetBytes, true)
})

test('缩放保持比例且从不放大小图', () => {
  assert.deepEqual(scaledSize(4000, 2000, 2048), { width: 2048, height: 1024 })
  assert.deepEqual(scaledSize(800, 600, 2048), { width: 800, height: 600 })
  assert.deepEqual(scaledSize(1000, 4000, 2048), { width: 512, height: 2048 })
  assert.deepEqual(scaledSize(0, 500, 2048), { width: 1, height: 500 })
})

test('长截图放宽长边以保留文字可读性', () => {
  assert.equal(targetLongEdge('evidence', 1080, 6000), IMAGE_POLICY.evidence.longShotLongEdge)
  assert.equal(targetLongEdge('evidence', 1440, 2000), IMAGE_POLICY.evidence.maxLongEdge)
  assert.equal(targetLongEdge('photo', 1080, 6000), IMAGE_POLICY.photo.longShotLongEdge)
  assert.equal(targetLongEdge('avatar', 3000, 3000), IMAGE_POLICY.avatar.maxLongEdge)
})

test('HEIC 判定依据 MIME 与扩展名，普通通用类型按后缀处理', () => {
  assert.equal(isHeicLike({ type: 'image/heic', name: 'a.jpg' }), true)
  assert.equal(isHeicLike({ type: 'image/heif', name: 'b.jpg' }), true)
  assert.equal(isHeicLike({ type: 'application/octet-stream', name: 'IMG_0001.HEIC' }), true)
  assert.equal(isHeicLike({ type: '', name: 'IMG_0002.heif' }), true)
  assert.equal(isHeicLike({ type: 'image/jpeg', name: 'IMG_0003.HEIC' }), false)
  assert.equal(isHeicLike({ type: 'application/octet-stream', name: 'photo.jpg' }), false)
})

test('扩展名按实际输出类型生成，不沿用原文件名', () => {
  assert.equal(extensionForType('image/jpeg'), 'jpg')
  assert.equal(extensionForType('image/png'), 'png')
  assert.equal(extensionForType('image/webp'), 'webp')
  assert.equal(extensionForType('image/jpeg;charset=utf-8'), 'jpg')
  assert.equal(extensionForType('', 'jpg'), 'jpg')
})

test('原图上限拦截超大文件与超大像素，但允许常见手机原图', () => {
  assert.equal(sourceRejection(SOURCE_MAX_BYTES - 1, 12_000_000), '')
  assert.equal(sourceRejection(12.2 * 1024 * 1024, 4032 * 3024), '')
  assert.equal(/40MB/.test(sourceRejection(SOURCE_MAX_BYTES + 1, 1000)), true)
  assert.equal(/像素过大/.test(sourceRejection(1024, 80_000_000)), true)
})

test('体积阈值按用途区分，处理后可继续压缩', () => {
  assert.equal(withinTarget(300 * 1024, 'avatar'), true)
  assert.equal(withinTarget(1.5 * 1024 * 1024, 'photo'), true)
  assert.equal(withinTarget(3 * 1024 * 1024, 'photo'), false)
  assert.equal(withinHardLimit(4.9 * 1024 * 1024, 'evidence'), true)
  assert.equal(withinHardLimit(5.1 * 1024 * 1024, 'evidence'), false)
  assert.equal(nextQuality(0.85), 0.72)
  assert.equal(nextQuality(0.5), undefined)
  assert.equal(nextScale(1), 0.85)
  assert.equal(nextScale(0.85), 0.7)
  assert.equal(nextScale(0.7), undefined)
})

test('错误按格式/解码/体积/网络/配额分类', () => {
  assert.equal(classifyImageError(new Error('这张 HEIC 照片无法解码。')), 'decode')
  assert.equal(classifyImageError(new Error('处理后仍有 7.9MB，超过 5MB 上限，请裁切后重试。')), 'size')
  assert.equal(classifyImageError(new Error('网络中断导致上传失败')), 'network')
  assert.equal(classifyImageError(new Error('云端空间不足，超出配额')), 'quota')
  assert.equal(classifyImageError(new Error('登录状态已失效')), 'auth')
  assert.equal(classifyImageError(new Error('未知错误')), 'unknown')
})
