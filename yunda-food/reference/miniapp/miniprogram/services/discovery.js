// 只解释明确保存的数据；不从菜名、家乡或 areaId 猜地点与口味。
const SPICY = ['不辣', '微辣', '中辣', '很辣']
const SWEET = ['无糖或不甜', '少甜', '正常甜', '偏甜']
const tasteTags = require('./taste-tags')
const TAGS = tasteTags.OPTIONS
const CATEGORIES = ['全部', '正餐', '小吃', '饮品', '甜品']
const PREF_KEY = 'food_preferences_v1'
const hometown = require('./hometown')
function numeric(value) { return (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value)) ? Number(value) : null }
function level(value) { const number = numeric(value); return number != null && Number.isInteger(number) && number >= 0 && number <= 3 ? number : null }
function hometownKey(value) { return String(value || '').trim().replace(/[\s·，,。/\-]/g, '') }
function hometownFromRegion(region) { const place = hometown.parse(hometown.fromRegion(region)); return place ? place.value : '' }
function regionFromHometown(value) { const place = hometown.parse(value); return place ? place.region : [] }
function hometownLabel(value) { return hometown.label(value) }
function sameHometown(item, preferences) { return hometown.same(preferences && preferences.hometown, item.authorHometown) }
function isDrink(category) { return ['饮品', '甜品'].includes(category) }
function normalize(row) {
  const taste = row.taste || {}
  const locationType = ['inside', 'outside'].includes(row.locationType) ? row.locationType : 'unknown'
  const priceBasis = ['portion', 'person'].includes(row.priceBasis) ? row.priceBasis : 'unknown'
  const spicy = isDrink(row.category) ? null : level(taste.spicy)
  const sweet = isDrink(row.category) ? level(taste.sweet) : null
  const tags = Array.isArray(taste.tags) ? taste.tags.filter((tag) => tasteTags.READABLE.includes(tag)).slice(0, 2) : []
  const place = locationType === 'inside' ? [row.school, row.campus, row.venue] : [row.region, row.venue, row.addressSummary]
  const price = numeric(row.price)
  const latitude = numeric(row.latitude); const longitude = numeric(row.longitude)
  const located = latitude != null && longitude != null && latitude >= 24.35 && latitude <= 26.45 && longitude >= 102.1 && longitude <= 103.75
  const tasteText = [spicy == null ? '' : SPICY[spicy], sweet == null ? '' : SWEET[sweet], ...tags, ['冷', '热', '常温'].includes(taste.temperature) ? taste.temperature : ''].filter(Boolean).join(' · ') || '口味未标注'
  return { ...row, id: row.id || row._id, locationType, priceBasis, price, latitude: located ? latitude : null, longitude: located ? longitude : null, school: row.school || '', campus: row.campus || '', region: row.region || '',
    taste: { spicy, sweet, tags, staple: taste.staple || '', temperature: taste.temperature || '' }, tasteText, authorHometownLabel: hometownLabel(row.authorHometown),
    placeLabel: locationType === 'inside' ? '高校内' : locationType === 'outside' ? '高校外' : '地点类型未标注',
    placeText: place.filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ') || row.venue || '地点未标注',
    priceLabel: price == null ? '价格未标注' : priceBasis === 'portion' ? '元 / 份' : priceBasis === 'person' ? '元 / 人' : '元 · 参考价',
  }
}
function defaultPreferences() { return { hometown: '', spicy: null, tags: [], staple: '', budget: '', visited: false } }
function getPreferences() { const owner = wx.getStorageSync('food_preferences_owner'); const value = wx.getStorageSync(owner ? PREF_KEY + ':' + owner : PREF_KEY); const data = { ...defaultPreferences(), ...(value && typeof value === 'object' ? value : {}) }; return { ...data, spicy: level(data.spicy), tags: Array.isArray(data.tags) ? data.tags.filter(t => tasteTags.READABLE.includes(t)).slice(0, 2) : [] } }
function savePreferences(value) { const data = { ...defaultPreferences(), ...value, hometown: hometownKey(value.hometown), spicy: level(value.spicy), visited: true }; const owner = wx.getStorageSync('food_preferences_owner'); if (owner) wx.setStorageSync(PREF_KEY + ':' + owner, data); wx.setStorageSync(PREF_KEY, data); return data }
function activateOwner(owner) {
  if (!wx.getStorageSync('food_preferences_owner')) {
    const legacy = wx.getStorageSync(PREF_KEY)
    if (legacy && typeof legacy === 'object' && !wx.getStorageSync('food_preferences_legacy_unbound')) wx.setStorageSync('food_preferences_legacy_unbound', legacy)
  }
  wx.setStorageSync('food_preferences_owner', owner)
}
function filterItems(items, filters = {}, preferences = {}) {
  const words = String(filters.keyword || '').trim().toLowerCase()
  const budget = numeric(filters.budget)
  const people = Number(filters.people) > 0 ? Number(filters.people) : 1
  return items.map(normalize).filter((item) => {
    if (item.status && item.status !== 'published') return false
    if (words && ![item.name, item.venue, item.placeText].join(' ').toLowerCase().includes(words)) return false
    if (filters.locationType && filters.locationType !== 'all' && item.locationType !== filters.locationType) return false
    if (filters.place && ![item.school, item.campus, item.region, item.venue, item.addressSummary].join(' ').includes(filters.place)) return false
    if (filters.category && filters.category !== '全部' && item.category !== filters.category) return false
    if (filters.spicy != null && filters.spicy !== '' && item.taste.spicy !== Number(filters.spicy)) return false
    if (filters.sweet != null && filters.sweet !== '' && item.taste.sweet !== Number(filters.sweet)) return false
    if (budget != null && (item.priceBasis === 'unknown' || item.price == null || item.price <= 0 || item.price * people > budget)) return false
    if (filters.hometownOnly && !sameHometown(item, preferences)) return false
    return true
  }).map((item) => {
    const hometown = sameHometown(item, preferences)
    const compatible = preferences.spicy != null && item.taste.spicy != null && item.taste.spicy <= Number(preferences.spicy)
    const sharedTags = item.taste.tags.filter((tag) => (preferences.tags || []).includes(tag))
    const staple = Boolean(preferences.staple && preferences.staple === item.taste.staple)
    return { ...item, sameHometown: hometown, reasons: [hometown ? '同乡推荐（家乡自填）' : '', compatible ? `${SPICY[item.taste.spicy]}在你的接受范围` : '', sharedTags.length ? sharedTags.join('、') + '符合你偏好' : '', staple ? '你常吃的' + item.taste.staple : ''].filter(Boolean).join(' · '), orderScore: (hometown ? 10 : 0) + (compatible ? 1 : 0) + sharedTags.length + (staple ? 1 : 0) }
  }).sort((a, b) => b.orderScore - a.orderScore)
}
function chinaDay() { const d = new Date(Date.now() + 8 * 3600000); return d.toISOString().slice(0, 10) }
module.exports = { SPICY, SWEET, TAGS, CATEGORIES, level, numeric, hometownKey, hometownFromRegion, regionFromHometown, hometownLabel, sameHometown, isDrink, normalize, getPreferences, savePreferences, activateOwner, defaultPreferences, filterItems, chinaDay }
