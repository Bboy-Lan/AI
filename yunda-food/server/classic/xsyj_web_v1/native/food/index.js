const hometown = require('./hometown')
const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const contract = require('./item-contract')
const reviewPolicy = require('../../review-policy.cjs')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const C = { profiles: 'xsyj_profiles', items: 'xsyj_food_items', favorites: 'xsyj_favorites', likes: 'xsyj_food_likes', direct: 'xsyj_direct_messages', reviews: 'xsyj_reviews', admins: 'xsyj_admins', events: 'xsyj_events' }
const KUNMING_AREAS = new Set(['ynu-chenggong', 'ynu-donglu', 'university-town', 'chenggong', 'wuhua', 'panlong', 'xishan', 'guandu', 'jinning', 'anning', 'zhweitang', 'yuweitang', 'shilinjie', 'nandu'])
const BLOCKED_TERMS = ['加微', '加群', '推广', '广告', '代理', '兼职', '刷单', '博彩', '赌博', '色情', '裸聊', '毒品', '贷款', '代购彩票']

function fail(message, code) { const error = new Error(message); error.publicMessage = message; if (code) error.code = code; throw error }
function text(value, max) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max) }
function finiteNumber(value) { if (value == null || value === '' || typeof value === 'boolean') return null; const number = Number(value); return Number.isFinite(number) ? number : null }
function now() { return db.serverDate() }
function chinaDay() { const china = new Date(Date.now() + 8 * 60 * 60 * 1000); return `${china.getUTCFullYear()}-${String(china.getUTCMonth() + 1).padStart(2, '0')}-${String(china.getUTCDate()).padStart(2, '0')}` }
function compact(value) { return String(value || '').toLowerCase().replace(/[\s\p{P}\p{S}_]/gu, '') }
function assertSafeText(value, label) {
  const raw = String(value || ''); const normalized = compact(raw)
  if (BLOCKED_TERMS.some((term) => normalized.includes(term))) fail(`${label}包含不适合发布或疑似推广的内容，请修改后再试。`)
  if (/https?:\/\/|www\.|\b(?:vx|wx)\s*[:：]?\s*[a-z0-9_-]{4,}/i.test(raw) || /1[3-9]\d{9}/.test(raw)) fail(`${label}不能包含链接、联系方式或引流信息。`)
  if (/(.)\1{8,}/.test(raw)) fail(`${label}存在大量重复字符，请正常填写。`)
}
function assertHometown(value) {
  if (!/^[\u4e00-\u9fff]{2,30}$/.test(value) || /(.)\1{3,}/.test(value)) fail('请填写真实的吃货家乡，例如“昭通镇雄”；不需要填写详细住址。')
  assertSafeText(value, '吃货家乡')
}
async function dailyCount(collection, id, day, limit) { const result = await db.collection(collection).where({ ownerOpenId: id, submissionDay: day }).limit(limit).get(); return result.data.length }
function openId() { const value = cloud.getWXContext(); if (!value.OPENID) fail('未识别到微信身份，请重新进入小程序。'); return value.OPENID }

async function findOne(collection, where) { const result = await db.collection(collection).where(where).limit(1).get(); return result.data[0] || null }
async function itemById(itemId) { return db.collection(C.items).doc(itemId).get().then((result) => result.data).catch(() => null) }
async function profileFor(id) { return findOne(C.profiles, { ownerOpenId: id }) }
async function adminFor(id) { return findOne(C.admins, { openId: id, enabled: true }) }
async function requireProfile(id, options = {}) {
  const profile = await profileFor(id)
  if (!profile || String(profile.foodieId || '').trim().length < 2 || !String(profile.avatarFileId || '').startsWith('cloud://') || !hometown.parse(profile.hometown)) fail('请先完成头像、昵称和家乡省市资料。')
  if (profile.accountStatus === 'banned' && !options.allowBanned) fail(profile.banReason || '当前账号已被封禁，请申请复核。', 'ACCOUNT_BANNED')
  if (profile.moderationStatus === 'restricted' && !options.allowRestricted) fail(`当前身份已被限制发布内容${profile.moderationReason ? `：${profile.moderationReason}` : ''}`)
  return profile
}
async function requireAdmin(id) { if (!(await adminFor(id))) fail('无管理员权限。') }
async function event(type, operatorOpenId, targetType, targetId, reason, snapshot) { await db.collection(C.events).add({ data: { type, operatorOpenId, targetType, targetId, reason: reason || '', ...(snapshot?{snapshot}:{}), createdAt: now() } }) }

async function getMyProfile(id) { return profileFor(id) }
async function getPublicProfile(id, payload) {
  const profileId = text(payload.profileId, 100); const itemId = text(payload.itemId, 100); const reviewId = text(payload.reviewId, 100); const self = payload.self === true
  if ([profileId, itemId, reviewId, self].filter(Boolean).length !== 1) fail('请提供一个明确的主页目标。')
  let profile
  if (self) profile = await profileFor(id)
  else if (profileId) profile = await db.collection(C.profiles).doc(profileId).get().then(result => result.data).catch(() => null)
  else if (itemId) { const item = await getItem(id, { id: itemId }); if (!item || !item.ownerOpenId) fail('该用户主页暂不可访问。'); profile = await profileFor(item.ownerOpenId) }
  else {
    const review = await db.collection(C.reviews).doc(reviewId).get().then(result => result.data).catch(() => null)
    if (!review || review.status !== 'published' && review.ownerOpenId !== id && !await adminFor(id)) fail('该用户主页暂不可访问。')
    if (!await getItem(id, { id: review.itemId })) fail('该用户主页暂不可访问。')
    profile = await profileFor(review.ownerOpenId)
  }
  if (!profile || !profile.ownerOpenId) fail('该用户暂未设置个人资料。')
  const [admin, items] = await Promise.all([adminFor(profile.ownerOpenId), db.collection(C.items).where({ ownerOpenId: profile.ownerOpenId, status: 'published' }).orderBy('submittedAt', 'desc').limit(100).get()])
  const publicProfile = { _id: profile._id, foodieId: profile.foodieId || '未命名吃货', hometown: profile.hometown || '', avatarFileId: profile.avatarFileId || '', isAdmin: Boolean(admin) }
  const fields = ['_id', 'name', 'storeName', 'venue', 'price', 'priceBasis', 'imageFileIds', 'category', 'locationType', 'school', 'campus', 'region', 'addressSummary', 'taste', 'ratingAverage', 'ratingCount', 'status']
  return { profile: publicProfile, items: items.data.map(item => ({ ...Object.fromEntries(fields.filter(key => item[key] !== undefined).map(key => [key, item[key]])), authorNickname: publicProfile.foodieId, authorAvatarFileId: publicProfile.avatarFileId, authorHometown: publicProfile.hometown, authorRole: admin ? 'admin' : 'user' })), limit: 100 }
}
async function saveProfile(id, payload) {
  const foodieId = text(payload.foodieId, 20); const selectedHometown = hometown.parse(payload.hometown); const hometownValue = selectedHometown && selectedHometown.value; const defaultAreaId = text(payload.defaultAreaId, 40)
  const avatarFileId = text(payload.avatarFileId, 300)
  if (foodieId.length < 2) fail('请填写至少 2 个字的吃货昵称。')
  if (!hometownValue) fail('请通过选择器填写家乡省和市。')
  assertHometown(hometownValue)
  if (avatarFileId && !avatarFileId.startsWith('cloud://')) fail('头像格式无效，请重新选择。')
  assertSafeText(foodieId, '吃货昵称')
  const old = await profileFor(id); const savedAvatar = avatarFileId || old && old.avatarFileId || ''
  if (!savedAvatar.startsWith('cloud://')) fail('请选择并上传头像后再保存资料。')
  // A rejected avatar must stay rejected: the author has to upload a different photo, not re-pick the old one.
  if (old && old.avatarRejected && old.avatarRejected.fileId === savedAvatar) fail('这张头像已被驳回，请重新上传另一张。')
  const data = { foodieId, hometown: hometownValue, profileSchemaVersion: 2, defaultAreaId: defaultAreaId || 'ynu-chenggong', avatarFileId: savedAvatar, avatarRejected: old && old.avatarRejected && old.avatarRejected.fileId === savedAvatar ? old.avatarRejected : null, updatedAt: now() }
  if (old) await db.collection(C.profiles).doc(old._id).update({ data })
  else await db.collection(C.profiles).add({ data: { ...data, ownerOpenId: id, moderationStatus: 'active', moderationReason: '', createdAt: now() } })
  await db.collection(C.items).where({ ownerOpenId: id }).update({ data: { authorNickname: foodieId, authorHometown: hometownValue, authorAvatarFileId: data.avatarFileId, updatedAt: now() } })
  await db.collection(C.reviews).where({ ownerOpenId: id }).update({ data: { authorNickname: foodieId, authorHometown: hometownValue, authorAvatarFileId: data.avatarFileId, updatedAt: now() } })
  return profileFor(id)
}
async function listPublishedItems() { const result = await db.collection(C.items).where({ status: 'published' }).orderBy('submittedAt', 'desc').limit(100).get(); return result.data }
async function getItem(id, payload) {
  const itemId = text(payload.id, 100); if (!itemId) fail('缺少菜品标识。')
  const item = await itemById(itemId)
  if (!item) return null
  if (item.status === 'published' || item.ownerOpenId === id || await adminFor(id)) return item
  return null
}
async function submitItem(id, payload) {
  const profile = await requireProfile(id); const verifiedAdmin = Boolean(await adminFor(id)); const name = text(payload.name, 60); const storeName = text(payload.storeName, 40); const venue = text(payload.venue, 80); const description = text(payload.description, 500); const areaId = text(payload.areaId, 40); const price = finiteNumber(payload.price)
  if (name.length < 1 || venue.length < 1) fail('请填写菜品名称和具体地点。')
  if (!payload.locationType && !KUNMING_AREAS.has(areaId)) fail('投稿地点仅支持昆明市内的预设地点。')
  if (price == null || !Number.isInteger(price) || price < 1 || price > 999) fail('请填写1～999元的整数价格。')
  assertSafeText(name, '菜品名称'); assertSafeText(storeName, '店名'); assertSafeText(venue, '具体地点'); assertSafeText(description, '补充说明')
  if (storeName && storeName.length < 2) fail('店名至少需要 2 个字，没有正式店名可以留空。')
  const extra = contract.extension(payload, null, text(payload.category, 20) || '其他', assertSafeText)
  const requestId = requestKey(payload.clientRequestId)
  const documentId = requestId ? submissionId(id, requestId) : ''
  const existing = documentId ? await submissionById(documentId) : null
  if (existing) {
    if (existing.ownerOpenId !== id) fail('提交身份不匹配。')
    return existing
  }
  const submissionDay = chinaDay()
  if (await dailyCount(C.items, id, submissionDay, 3) >= 3) fail('每位用户每天最多发布 3 条真实推荐，请明天再来分享。')
  const latitude = finiteNumber(payload.latitude); const longitude = finiteNumber(payload.longitude)
  if (latitude != null && (latitude < -90 || latitude > 90)) fail('位置纬度无效。')
  if (longitude != null && (longitude < -180 || longitude > 180)) fail('位置经度无效。')
  const imageFileIds = Array.isArray(payload.imageFileIds) ? payload.imageFileIds.map((value) => text(value, 300)).filter(Boolean).slice(0, 3) : []
  if (!imageFileIds.length) fail('请至少上传 1 张实拍照片。')
  if (description.length < 10) fail('请写至少 10 个字的推荐理由。')
  const authorAte = Boolean(payload.authorAte)
  const authorAteDate = chinaDay()
  if (!authorAte) fail('只接收投稿人亲自吃过的真实推荐。')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(authorAteDate)) fail('请填写亲自吃过的日期。')
  if (extra.itemSchemaVersion === 2) validateNewSubmission(payload, imageFileIds, latitude, longitude)
  const data = {
    ownerOpenId: id, name, storeName, venue, areaId, campusId: 'kunming', category: text(payload.category, 20) || '其他', price, description, imageFileIds,
    authorNickname: profile.foodieId, authorHometown: profile.hometown, authorAvatarFileId: profile.avatarFileId || '', authorAte, authorAteDate,
    ...reviewPolicy.resubmit(null,verifiedAdmin), status: 'published', hiddenReason: '', submittedAt: now(), submissionDay, contentUpdatedAt: now(), priceUpdatedAt: now(), latitude, longitude, addressSummary: text(payload.addressSummary, 120),
    favoriteCount: 0, ratingCount: 0, ratingAverage: 0, verificationStatus: 'unverified', verificationPositiveCount: 0, verificationNegativeCount: 0,
    ...savedLocation(payload), ...extra, ...(documentId ? { _id: documentId, clientRequestId: requestId } : {}),
  }
  if (extra.itemSchemaVersion === 2 && imageFileIds.some((file) => !file.startsWith('cloud://'))) fail('照片须为上传后的云文件ID。')
  try {
    const result = await db.collection(C.items).add({ data })
    return db.collection(C.items).doc(result._id).get().then((value) => value.data)
  } catch (error) {
    // 自定义_id唯一性使并发重试只产生一条记录；不使用set覆盖已有状态。
    if (documentId) { const saved = await submissionById(documentId); if (saved && saved.ownerOpenId === id) return saved }
    throw error
  }
}
async function myItems(id) { const result = await db.collection(C.items).where({ ownerOpenId: id }).orderBy('submittedAt', 'desc').limit(100).get(); return result.data }
async function updateItem(id, payload) {
  const profile = await requireProfile(id, { allowRestricted: true }); const itemId = text(payload.id, 100); const item = await itemById(itemId)
  if (!item) fail('投稿不存在或已被删除。')
  if (item.ownerOpenId !== id) fail('只能编辑自己的投稿。')
  const name = text(payload.name, 60); const storeName = text(payload.storeName == null ? item.storeName || '' : payload.storeName, 40); const venue = text(payload.venue, 80); const description = text(payload.description, 500); const areaId = text(payload.areaId || item.areaId, 40); const price = finiteNumber(payload.price)
  const category = text(payload.category == null ? item.category : payload.category, 20) || '其他'
  const extra = contract.extension(payload, item, category, assertSafeText)
  if (name.length < 1 || venue.length < 1) fail('请填写菜品名称和具体地点。')
  if (!extra.itemSchemaVersion && !KUNMING_AREAS.has(areaId)) fail('投稿地点仅支持昆明市内的预设地点。')
  if (price == null || price <= 0 || price >= 1000) fail('请填写1～999元的整数价格。')
  assertSafeText(name, '菜品名称'); assertSafeText(storeName, '店名'); assertSafeText(venue, '具体地点'); assertSafeText(description, '补充说明')
  if (storeName && storeName.length < 2) fail('店名至少需要 2 个字，没有正式店名可以留空。')
  const authorAte = Boolean(payload.authorAte); const authorAteDate = chinaDay()
  if (!authorAte || !/^\d{4}-\d{2}-\d{2}$/.test(authorAteDate)) fail('请确认亲自吃过，并填写日期。')
  const latitude = finiteNumber(payload.latitude); const longitude = finiteNumber(payload.longitude)
  if (latitude != null && (latitude < -90 || latitude > 90)) fail('位置纬度无效。')
  if (longitude != null && (longitude < -180 || longitude > 180)) fail('位置经度无效。')
  const imageFileIds = Array.isArray(payload.imageFileIds) ? payload.imageFileIds.map((value) => text(value, 300)).filter(Boolean).slice(0, 3) : item.imageFileIds || []
  if (!imageFileIds.length) fail('请至少上传 1 张实拍照片。')
  if (description.length < 10) fail('请写至少 10 个字的推荐理由。')
  if (extra.itemSchemaVersion === 2 || item.itemSchemaVersion === 2) validateNewSubmission(payload, imageFileIds, latitude, longitude)
  await db.runTransaction(async tx=>{const ref=tx.collection(C.items).doc(itemId),current=(await ref.get()).data;reviewPolicy.assertEditable(current,payload,fail);await ref.update({ data: {
    name, storeName, venue, areaId, price, category, description, imageFileIds, authorAte, authorAteDate,
    latitude: Object.prototype.hasOwnProperty.call(payload, 'latitude') ? latitude : item.latitude == null ? null : item.latitude,
    longitude: Object.prototype.hasOwnProperty.call(payload, 'longitude') ? longitude : item.longitude == null ? null : item.longitude,
    ...extra, ...savedLocation(payload, item),
    addressSummary: payload.addressSummary == null ? item.addressSummary || '' : text(payload.addressSummary, 120), authorNickname: profile.foodieId, authorHometown: profile.hometown, authorAvatarFileId: profile.avatarFileId || '', updatedAt: now(), contentUpdatedAt: now(), priceUpdatedAt: now(), ...reviewPolicy.resubmit(current,Boolean(await adminFor(id))),
  } })})
  await event('update_item', id, 'item', itemId, '投稿人补充或修改内容')
  return itemById(itemId)
}
async function updateItemLocation(id, payload) {
  await requireProfile(id, { allowRestricted: true })
  const itemId = text(payload.id, 100), requestId = requestKey(payload.clientRequestId)
  if (!itemId || !requestId) fail('缺少投稿或定位保存编号。')
  if (payload.latitude == null || payload.longitude == null || payload.latitude === '' || payload.longitude === '') fail('请在地图选定完整位置。')
  const location = savedLocation(payload)
  if (location.latitude == null || location.longitude == null) fail('请在地图选定完整位置。')
  const expected = payload.expected
  if (!expected || typeof expected !== 'object' || !['latitude', 'longitude', 'locationName', 'locationAddress'].every(key => Object.prototype.hasOwnProperty.call(expected, key))) fail('原定位状态不完整，请重新读取。')
  const stamp = row => { const lat = finiteNumber(row.latitude), lon = finiteNumber(row.longitude); const valid = lat != null && lon != null && lat >= 24.35 && lat <= 26.45 && lon >= 102.1 && lon <= 103.75; return JSON.stringify([valid ? lat : null, valid ? lon : null, row.locationName || '', row.locationAddress || '']) }
  return db.runTransaction(async transaction => {
    const ref = transaction.collection(C.items).doc(itemId); const item = await ref.get().then(r => r.data).catch(() => null)
    if (!item || item.ownerOpenId !== id) fail('只能修改自己投稿的地图位置。')
    if (item.locationRequestId === requestId) {
      if (stamp(item) !== stamp(location)) fail('定位保存编号与内容不匹配。')
      return { id: itemId, clientRequestId: requestId, ...location }
    }
    if (stamp(item) !== stamp(expected)) fail('地图位置已被修改，请重新读取后再选点。')
    reviewPolicy.assertEditable(item,payload,fail)
    await ref.update({ data: { ...location, locationRequestId: requestId, contentUpdatedAt: now(), updatedAt: now() } })
    await transaction.collection(C.events).doc('location_edit_' + submissionId(id, itemId + ':' + requestId)).set({ data: { type: 'update_item_location', operatorOpenId: id, targetType: 'item', targetId: itemId, reason: '投稿人更新地图位置', createdAt: now() } })
    return { id: itemId, clientRequestId: requestId, ...location }
  })
}
async function getFavoriteIds(id) { const result = await db.collection(C.favorites).where({ ownerOpenId: id }).limit(100).get(); return result.data.map((item) => item.itemId) }
async function toggleFavorite(id, payload) {
  const itemId = text(payload.itemId, 100); const item = await getItem(id, { id: itemId }); if (!item || item.status !== 'published') fail('该投稿已下架或不可收藏。')
  const old = await findOne(C.favorites, { ownerOpenId: id, itemId })
  if (old) { await db.collection(C.favorites).doc(old._id).remove(); await db.collection(C.items).doc(itemId).update({ data: { favoriteCount: _.inc(-1) } }); return { favorite: false } }
  await db.collection(C.favorites).add({ data: { ownerOpenId: id, itemId, createdAt: now() } }); await db.collection(C.items).doc(itemId).update({ data: { favoriteCount: _.inc(1) } }); return { favorite: true }
}
async function getLikedItemIds(id) { const result = await db.collection(C.likes).where({ ownerOpenId: id }).limit(100).get(); return result.data.map((item) => item.itemId) }
// 点赞只计数：同一个人再次点击就是取消，计数永远不为负数。
async function toggleFoodLike(id, payload) {
  const itemId = text(payload.itemId, 100); if (typeof payload.liked !== 'boolean') fail('点赞状态无效。')
  const item = await getItem(id, { id: itemId }); if (!item || item.status !== 'published') fail('该推荐已下架或暂不可点赞。')
  const old = await findOne(C.likes, { ownerOpenId: id, itemId }), current = Math.max(0, Number(item.likeCount) || 0)
  if (payload.liked && !old) {
    await db.collection(C.likes).add({ data: { ownerOpenId: id, itemId, createdAt: now() } })
    await db.collection(C.items).doc(itemId).update({ data: { likeCount: current + 1 } })
  } else if (!payload.liked && old) {
    await db.collection(C.likes).doc(old._id).remove()
    await db.collection(C.items).doc(itemId).update({ data: { likeCount: Math.max(0, current - 1) } })
  }
  return { liked: payload.liked, likeCount: payload.liked === Boolean(old) ? current : Math.max(0, current + (payload.liked ? 1 : -1)) }
}
async function rebuildItemRatings(itemId) {
  const result = await db.collection(C.reviews).where({ itemId, status: 'published' }).limit(100).get()
  const ratings = result.data.map((review) => Number(review.rating)).filter((rating) => rating >= 1 && rating <= 5)
  const verified = result.data.filter((review) => review.foodVerified === true).length
  const average = ratings.length ? Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) / 10 : 0
  await db.collection(C.items).doc(itemId).update({ data: { ratingCount: ratings.length, ratingAverage: average, verificationPositiveCount: verified, verificationNegativeCount: Math.max(0, ratings.length - verified), verificationStatus: verified >= 2 ? 'verified' : 'unverified', updatedAt: now() } })
}
async function listReviews(id, payload) {
  const itemId = text(payload.itemId, 100); const item = await getItem(id, { id: itemId }); if (!item) return []
  const result = await db.collection(C.reviews).where({ itemId, status: 'published' }).orderBy('updatedAt', 'desc').limit(100).get()
  const decorated = await authorBadges(result.data)
  return decorated.map((review) => ({ _id: review._id, itemId: review.itemId, status: review.status, own:review.ownerOpenId===id, rating: review.rating, text: review.text || '', ateDate: review.ateDate || '', foodVerified: Boolean(review.foodVerified), authorNickname: review.authorNickname || '同学', authorHometown: review.authorHometown || '', authorAvatarFileId: review.authorAvatarFileId || '', authorRole: review.authorRole,reviewTag:review.reviewTag,reviewVersion:review.reviewVersion,adminEdited:review.adminEdited }))
}
async function upsertReview(id, payload) {
  const profile = await requireProfile(id); const itemId = text(payload.itemId, 100); const item = await itemById(itemId)
  if (!item || item.status !== 'published') fail('该投稿已下架或不可评分。')
  if (item.ownerOpenId === id) fail('投稿人不能给自己的推荐评分。')
  const rating = Math.round(finiteNumber(payload.rating) || 0); const reviewText = text(payload.text, 300); const ateDate = chinaDay()
  if (rating < 1 || rating > 5) fail('请给出 1 到 5 星评分。')
  if (!Boolean(payload.ate) || !/^\d{4}-\d{2}-\d{2}$/.test(ateDate)) fail('只有亲自吃过并填写日期，才能提交评价。')
  assertSafeText(reviewText, '评价内容')
  const old = await findOne(C.reviews, { itemId, ownerOpenId: id })
  if (!old && await dailyCount(C.reviews, id, chinaDay(), 10) >= 10) fail('每位用户每天最多新增 10 条评价，请稍后再试。')
  const data = { itemId, ownerOpenId: id, authorNickname: profile.foodieId, authorHometown: profile.hometown, authorAvatarFileId: profile.avatarFileId || '', rating, text: reviewText, ateDate, foodVerified: Boolean(payload.foodVerified), status: 'published', submissionDay: old && old.submissionDay || chinaDay(), updatedAt: now() }
  const reviewId=old?old._id:crypto.createHash('sha256').update(id+':'+itemId).digest('hex').slice(0,32)
  // 管理员自己写评价不需要别人审，和其他四类内容同一口径。
  const verifiedAdmin=Boolean(await adminFor(id))
  await db.runTransaction(async tx=>{const ref=tx.collection(C.reviews).doc(reviewId);const current=await ref.get().then(r=>r.data).catch(()=>null);reviewPolicy.assertEditable(current,payload,fail);const {_id,...kept}=current||{};await ref.set({data:{...kept,...data,...reviewPolicy.resubmit(current,verifiedAdmin),createdAt:current?.createdAt||now()}})})
  await rebuildItemRatings(itemId)
  return { ok: true }
}
async function submitIssue(id, payload) {
  await requireProfile(id); const itemId = text(payload.itemId, 100); const item = await itemById(itemId)
  if (!item || item.status !== 'published') fail('该投稿暂不可反馈。')
  const type = text(payload.type, 30); const reason = text(payload.reason, 300)
  if (!['price_report', 'content_report'].includes(type) || reason.length < 2) fail('请说明需要反馈的问题。')
  assertSafeText(reason, '反馈内容')
  await event(type, id, 'item', itemId, reason, {name:item.name,description:item.description||'',images:item.imageFileIds||[]})
  return { ok: true }
}
async function myFavoriteItems(id) {
  const favorites = await db.collection(C.favorites).where({ ownerOpenId: id }).orderBy('createdAt', 'desc').limit(100).get()
  const rows = await Promise.all(favorites.data.map((favorite) => itemById(favorite.itemId)))
  const visible = rows.filter((item) => item && item.status === 'published')
  return { items: visible, unavailableCount: favorites.data.length - visible.length }
}
async function myReviews(id) {
  const result = await db.collection(C.reviews).where({ ownerOpenId: id }).orderBy('updatedAt', 'desc').limit(100).get()
  const items = await Promise.all(result.data.map((review) => itemById(review.itemId)))
  return result.data.map((review, index) => ({
    _id: review._id, itemId: review.itemId, itemName: items[index] && items[index].name || '关联投稿已删除', itemStatus: items[index] && items[index].status || 'unavailable',
    rating: review.rating, text: review.text || '', ateDate: review.ateDate || '', foodVerified: Boolean(review.foodVerified), status: review.status || 'published', moderationReason: review.moderationReason || '', updatedAt: review.updatedAt, reviewTag:review.reviewTag,reviewVersion:review.reviewVersion,adminEdited:review.adminEdited,reviewReason:review.reviewReason,
  }))
}
async function adminSetItemVisibility(id, payload) {
  await requireAdmin(id); const itemId = text(payload.itemId, 100); const hidden = Boolean(payload.hidden); const reason = text(payload.reason, 120)
  if (reason.length < 2) fail(hidden ? '下架时必须填写处理原因。' : '恢复公开时必须填写处理原因。')
  await db.collection(C.items).doc(itemId).update({ data: { status: hidden ? 'hidden' : 'published', hiddenReason: hidden ? reason : '', hiddenAt: hidden ? now() : null, updatedAt: now() } })
  await event(hidden ? 'hide_item' : 'restore_item', id, 'item', itemId, reason); return { hidden }
}
async function adminListItems(id) { await requireAdmin(id); const result = await db.collection(C.items).orderBy('submittedAt', 'desc').limit(100).get(); return result.data }
async function adminListReviews(id) {
  await requireAdmin(id)
  const result = await db.collection(C.reviews).orderBy('updatedAt', 'desc').limit(100).get()
  const items = await Promise.all(result.data.map((review) => itemById(review.itemId)))
  return result.data.map((review, index) => ({ ...review, itemName: items[index] && items[index].name || '关联投稿已删除' }))
}
async function adminSetReviewVisibility(id, payload) {
  await requireAdmin(id); const reviewId = text(payload.reviewId, 100); const hidden = Boolean(payload.hidden); const reason = text(payload.reason, 120); const review = await db.collection(C.reviews).doc(reviewId).get().then((result) => result.data).catch(() => null)
  if (!review) fail('评价不存在或已被删除。')
  if (reason.length < 2) fail(hidden ? '下架评价时必须填写处理原因。' : '恢复评价时必须填写处理原因。')
  await db.collection(C.reviews).doc(reviewId).update({ data: { status: hidden ? 'hidden' : 'published', moderationReason: hidden ? reason : '', moderatedAt: now(), updatedAt: now() } })
  await rebuildItemRatings(review.itemId); await event(hidden ? 'hide_review' : 'restore_review', id, 'review', reviewId, reason); return { hidden }
}
function adminProfileSummary(profile, isAdmin) {
  return { _id: profile._id, foodieId: profile.foodieId || '未命名吃货', hometown: profile.hometown || '', avatarFileId: profile.avatarFileId || '', isAdmin, accountStatus: profile.accountStatus || 'active', banReason: profile.banReason || '', moderationStatus: profile.moderationStatus || 'active', moderationReason: profile.moderationReason || '', updatedAt: profile.updatedAt }
}
async function adminListProfiles(id) {
  await requireAdmin(id)
  const result = await db.collection(C.profiles).orderBy('updatedAt', 'desc').limit(100).get()
  const flags = await adminFlags(result.data.map(profile => profile.ownerOpenId))
  return result.data.map(profile => adminProfileSummary(profile, flags.has(profile.ownerOpenId)))
}
async function adminGetProfileDetail(id, payload) {
  await requireAdmin(id)
  const profileId = text(payload.profileId, 100); const itemId = text(payload.itemId, 100); const reviewId = text(payload.reviewId, 100)
  if ([profileId, itemId, reviewId].filter(Boolean).length !== 1) fail('请提供一个明确的用户、美食或评价标识。')
  const item = itemId ? await itemById(itemId) : null
  if (itemId && (!item || !item.ownerOpenId)) fail('投稿不存在或已删除。')
  const review = reviewId ? await db.collection(C.reviews).doc(reviewId).get().then(result => result.data).catch(() => null) : null
  if (reviewId && (!review || !review.ownerOpenId)) fail('评价不存在或已删除。')
  const profile = itemId || reviewId ? await profileFor((item || review).ownerOpenId) : await db.collection(C.profiles).doc(profileId).get().then(result => result.data).catch(() => null)
  if (!profile || !profile.ownerOpenId) fail('用户资料不存在或标识不完整。')
  const [admin, items] = await Promise.all([adminFor(profile.ownerOpenId), payload.summaryOnly === true ? Promise.resolve({ data: [] }) : db.collection(C.items).where({ ownerOpenId: profile.ownerOpenId }).orderBy('submittedAt', 'desc').limit(100).get()])
  return { profile: adminProfileSummary(profile, Boolean(admin)), items: items.data.map(item => ({ _id: item._id, name: item.name, venue: item.venue, price: item.price, priceBasis: item.priceBasis, imageFileIds: item.imageFileIds || [], status: item.status, hiddenReason: item.hiddenReason || '', submittedAt: item.submittedAt })), limit: 100 }
}
async function adminSetProfileModeration(id, payload) {
  await requireAdmin(id)
  const profileId = text(payload.profileId, 100); const restricted = Boolean(payload.restricted); const reason = text(payload.reason, 120)
  if (!profileId) fail('缺少用户标识。')
  if (reason.length < 2) fail(restricted ? '限制用户时必须填写处理原因。' : '解除限制时必须填写处理原因。')
  const profile = await db.collection(C.profiles).doc(profileId).get().then((result) => result.data).catch(() => null)
  if (!profile) fail('用户资料不存在。')
  await db.collection(C.profiles).doc(profileId).update({ data: { moderationStatus: restricted ? 'restricted' : 'active', moderationReason: restricted ? reason : '', moderatedAt: now(), updatedAt: now() } })
  await event(restricted ? 'restrict_profile' : 'restore_profile', id, 'profile', profileId, reason)
  return { restricted }
}
function savedLocation(payload, previous = {}) {
  const has = key => Object.prototype.hasOwnProperty.call(payload, key)
  const latitude = finiteNumber(has('latitude') ? payload.latitude : previous.latitude); const longitude = finiteNumber(has('longitude') ? payload.longitude : previous.longitude)
  if ((latitude == null) !== (longitude == null) || latitude != null && (latitude < 24.35 || latitude > 26.45 || longitude < 102.1 || longitude > 103.75)) fail('地图坐标需成对填写且位于昆明服务范围。')
  for (const key of ['latitude', 'longitude']) if (has(key) && payload[key] != null && payload[key] !== '' && finiteNumber(payload[key]) == null) fail('地图坐标格式无效。')
  const locationName = latitude == null ? '' : text(has('locationName') ? payload.locationName : previous.locationName, 80)
  const locationAddress = latitude == null ? '' : text(has('locationAddress') ? payload.locationAddress : previous.locationAddress, 120)
  assertSafeText(locationName, '地图地点'); assertSafeText(locationAddress, '地图地址')
  return { latitude, longitude, locationName, locationAddress }
}
function validateNewSubmission(payload, imageFileIds, latitude, longitude) {
  if (payload.authorAte !== true) fail('请明确确认亲自吃过。')
  if (payload.imageFileIds && (!Array.isArray(payload.imageFileIds) || payload.imageFileIds.length > 3) || imageFileIds.some(file => !file.startsWith('cloud://'))) fail('最多3张照片，且必须是上传后的云文件ID。')
  if (latitude != null || longitude != null) {
    if (latitude == null || longitude == null || latitude < 24.35 || latitude > 26.45 || longitude < 102.1 || longitude > 103.75) fail('坐标需成对填写且位于当前昆明服务范围；不填坐标仍可投稿。')
  }
}
function requestKey(value) {
  if (value == null || value === '') return ''
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{12,80}$/.test(value)) fail('提交编号无效。')
  return value
}
function submissionId(id, requestId) { return crypto.createHash('sha256').update(id + ':' + requestId).digest('hex').slice(0, 32) }
async function submissionById(documentId) {
  try { return (await db.collection(C.items).doc(documentId).get()).data || null }
  catch (error) { if (/not.?found|not.?exist|不存在|DATABASE_DOCUMENT_NOT_EXIST/i.test(String(error.errMsg || error.message || ''))) return null; throw error }
}
async function findSubmission(id, payload) {
  const requestId = requestKey(payload.clientRequestId); if (!requestId) fail('缺少提交编号。')
  const item = await submissionById(submissionId(id, requestId))
  return item && item.ownerOpenId === id ? item : null
}
async function adminFlags(owners) {
  const ids = [...new Set(owners.filter(value => typeof value === 'string' && value))]
  const groups = []
  for (let index = 0; index < ids.length; index += 20) groups.push(ids.slice(index, index + 20))
  const results = await Promise.all(groups.map(group => db.collection(C.admins).where({ enabled: true, openId: db.command.in(group) }).limit(100).get()))
  return new Set(results.flatMap(result => result.data.map(row => row.openId)))
}
async function authorBadges(rows) {
  if (!rows.length) return rows
  try {
    const owners = [...new Set(rows.map(row => row.ownerOpenId).filter(owner => typeof owner === 'string' && owner))]
    const groups = []; for (let index = 0; index < owners.length; index += 20) groups.push(owners.slice(index, index + 20))
    const [flags, snapshots] = await Promise.all([adminFlags(owners), Promise.all(groups.map(group => db.collection(C.profiles).where({ ownerOpenId: db.command.in(group) }).limit(100).get()))])
    const profiles = new Map(snapshots.flatMap(result => result.data).map(profile => [profile.ownerOpenId, profile]))
    return rows.map(row => { const profile = profiles.get(row.ownerOpenId); return { ...row, ...(profile ? { authorNickname: profile.foodieId || '未命名吃货', authorAvatarFileId: profile.avatarFileId || '', authorHometown: profile.hometown || '' } : {}), authorRole: flags.has(row.ownerOpenId) ? 'admin' : 'user' } })
  }
  catch (error) { return rows.map(row => ({ ...row, authorRole: 'unknown' })) }
}
async function decorateRoles(action, result) {
  if (['listPublishedItems', 'myItems', 'myReviews', 'adminListItems', 'adminListReviews'].includes(action)) return authorBadges(result)
  if (action === 'getItem' && result) return (await authorBadges([result]))[0]
  if (action === 'myFavoriteItems') return { ...result, items: await authorBadges(result.items) }
  return result
}

const inboxHandlers = require('./inbox')({ db, C, requireAdmin, fail, text, now })
const appealHandlers = require('./appeals')({ db, collection: C.events, profiles: C.profiles, fail, text, profileFor, requireAdmin, adminFor, adminFlags, adminProfileSummary, now, chinaDay, requestKey, submissionId })
const feedbackHandlers = require('./feedback')({ db, collection: C.events, text, fail, profileFor, requireProfile, requireAdmin, chinaDay, now, requestKey, submissionId, adminFor, adminFlags })
const announcementHandlers = require('./announcement')({ db, collection: C.events, requireAdmin, adminFor, now, fail })
async function getCapabilities() { return { itemSchemaVersion: 2, idempotentSubmission: true, profileSchemaVersion: 2, customLocations: true, roleBadgesVersion: 1, adminProfileDetails: true, adminProfileContext: true, adminProfileLive: true, authorProfileSync: true, publicProfiles: true, feedbackInbox: true, accountBans: true, feedbackDialogue: true, messageCleanup: true, bulkReadCleanup: true, unifiedMessageSummary: true, directItemLocation: true, contentRecordDate: true, inboxMessages: true, issueInbox: true, accountAppeals: true, blackroom: true, announcements: true, automaticRecordDate: true, locationNavigation: true, tasteOptionsVersion: 2, version: 'budget-inline-inbox-20261031-v1' } }
async function whoAmI(id) { const profile = await profileFor(id); return { openId: id, isAdmin: Boolean(await adminFor(id)), restricted: Boolean(profile && profile.moderationStatus === 'restricted'), restrictionReason: profile && profile.moderationStatus === 'restricted' ? profile.moderationReason || '' : '', banned: Boolean(profile && profile.accountStatus === 'banned'), banReason: profile && profile.accountStatus === 'banned' ? profile.banReason || '' : '' } }
async function adminSetAccountBan(id, payload) {
  await requireAdmin(id)
  const profileId = text(payload.profileId, 100); const reason = text(payload.reason, 120)
  if (!profileId || typeof payload.banned !== 'boolean' || reason.length < 2) fail('请确认用户、操作类型并填写至少2个字的处理原因。')
  const profile = await db.collection(C.profiles).doc(profileId).get().then(r => r.data).catch(() => null)
  if (!profile || !profile.ownerOpenId) fail('用户资料不存在。')
  if (profile.ownerOpenId === id || await adminFor(profile.ownerOpenId)) fail('不能封禁或解除封禁管理员账号。')
  await db.collection(C.profiles).doc(profileId).update({ data: { accountStatus: payload.banned ? 'banned' : 'active', banReason: payload.banned ? reason : '', banUpdatedAt: now() } })
  await event(payload.banned ? 'ban_account' : 'unban_account', id, 'profile', profileId, reason)
  return { banned: payload.banned }
}
async function requireAccountAccess(id) {
  const profile = await profileFor(id)
  if (profile && profile.accountStatus === 'banned') fail(profile.banReason || '当前账号已被封禁，请申请复核。', 'ACCOUNT_BANNED')
}

const noticeHandlers=require('../../notice-center.cjs')({db,collection:C.events,requireAdmin,adminFor,profileFor,now,fail})
const handlers = { ...noticeHandlers, ...inboxHandlers, ...appealHandlers, ...feedbackHandlers, ...announcementHandlers, adminSetAccountBan, getCapabilities, findSubmission, getMyProfile, getPublicProfile, saveProfile, listPublishedItems: async () => listPublishedItems(), getItem, submitItem, updateItem, updateItemLocation, myItems, getFavoriteIds, toggleFavorite, getLikedItemIds, toggleFoodLike, listReviews, upsertReview, submitIssue, myFavoriteItems, myReviews, adminListItems, adminSetItemVisibility, adminListReviews, adminSetReviewVisibility, adminListProfiles, adminGetProfileDetail, adminSetProfileModeration, whoAmI }

// Only the trusted wrapper supplies the verified CloudBase UID. Old OpenIDs are never imported.
exports.dispatch=async(id,action,payload={})=>{
 const handler=handlers[action];if(!handler)fail('不支持的业务请求。');
 if(id&&!['whoAmI','getMyProfile','submitFeedback','myFeedback','submitAccountAppeal','myAccountAppeals','feedbackReplySummary','readFeedbackReply','replyFeedback','archiveFeedback','clearReadFeedback'].includes(action))await requireAccountAccess(id);
 return decorateRoles(action,await handler(id,payload));
};
exports.dependencies={noticesEnabled:true,rebuildItemRatings,db,fail,text,now,chinaDay,requireProfile,profileFor,adminFor,requireAdmin,assertSafeText,hash:(...parts)=>crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0,32)};

