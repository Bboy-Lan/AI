// 新模型只接受明确字段；旧调用可完全不携带新字段。
const DISTRICTS = [
  { id: 'chenggong', label: '昆明市呈贡区' }, { id: 'wuhua', label: '昆明市五华区' },
  { id: 'panlong', label: '昆明市盘龙区' }, { id: 'xishan', label: '昆明市西山区' },
  { id: 'guandu', label: '昆明市官渡区' }, { id: 'jinning', label: '昆明市晋宁区' }, { id: 'anning', label: '昆明市安宁市' },
]
const CAMPUSES = [
  { school: '云南大学', campus: '呈贡校区', areaId: 'ynu-chenggong' },
  { school: '云南大学', campus: '东陆校区', areaId: 'ynu-donglu' },
]
const TAGS = require('./taste-tags').READABLE
const STAPLES = ['米饭', '面食', '米线', '非主食']
const FIELDS = ['locationType', 'school', 'campus', 'region', 'taste', 'priceBasis']
const has = (x, k) => Object.prototype.hasOwnProperty.call(x, k)
function reject(message) { const error = new Error(message); error.publicMessage = message; throw error }
function string(value, label, max, required = false) {
  if (value == null && !required) return ''
  if (typeof value !== 'string' || value.trim().length > max || required && value.trim().length < 2) reject(label + '格式或长度无效。')
  return value.trim().replace(/\s+/g, ' ')
}
function level(value, label) { if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 3) reject('请选择有效的' + label + '（0～3）。'); return value }
function extension(payload, previous, category, assertSafeText) {
  const changed = FIELDS.some((key) => has(payload, key))
  if (!changed) {
    if (previous && previous.itemSchemaVersion === 2 && category !== previous.category) reject('修改类别时请同时补齐对应口味。')
    return {}
  }
  const pick = (key) => has(payload, key) ? payload[key] : previous && previous[key]
  const locationType = pick('locationType'); const priceBasis = pick('priceBasis')
  if (!['inside', 'outside'].includes(locationType)) reject('请选择校内或校外。')
  if (!['portion', 'person'].includes(priceBasis)) reject('请明确单份或人均价格。')
  if (!['正餐', '小吃', '饮品', '甜品'].includes(category)) reject('请选择正餐、小吃、饮品或甜品。')
  let school = ''; let campus = ''; let region = ''; let areaId
  if (locationType === 'inside') {
    school = string(pick('school'), '学校', 60); campus = string(pick('campus'), '校区', 60)
    const place = CAMPUSES.find(row => row.school === school && row.campus === campus)
    areaId = place ? place.areaId : 'custom-inside'
  } else {
    region = string(pick('region'), '所在地区', 80)
    const normalized = region.replace(/^云南省/, '').replace(/^昆明市/, '')
    const district = DISTRICTS.find(row => row.label.replace(/^昆明市/, '') === normalized)
    areaId = district ? district.id : 'custom-outside'
    assertSafeText(string(has(payload, 'addressSummary') ? payload.addressSummary : previous && previous.addressSummary, '地址补充', 120), '地址补充')
  }
  if (payload.areaId && payload.areaId !== areaId) reject('所选区域与明确地点不一致。')
  ;[school, campus, region].forEach(value => assertSafeText(value, '地点'))
  const incoming = has(payload, 'taste') ? payload.taste : {}
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) reject('口味格式无效。')
  const oldTaste = previous && previous.category === category ? previous.taste || {} : {}
  const taste = { ...oldTaste, ...incoming }
  let savedTaste
  if (['饮品', '甜品'].includes(category)) {
    if (incoming.spicy != null || incoming.staple || incoming.tags && incoming.tags.length) reject('饮品/甜品请填写甜度，不携带辣度和主食。')
    const temperature = taste.temperature || ''
    if (!['', '冷', '热', '常温'].includes(temperature)) reject('冷热选项无效。')
    savedTaste = { sweet: level(taste.sweet, '甜度'), temperature }
  } else {
    if (incoming.sweet != null || incoming.temperature) reject('菜品/小吃请填写辣度，不携带饮品甜度。')
    const tags = taste.tags || []; const staple = taste.staple || ''
    if (!Array.isArray(tags) || tags.length > 2 || new Set(tags).size !== tags.length || tags.some((tag) => !TAGS.includes(tag))) reject('口味标签最多两项，且只能使用预设标签。')
    if (tags.includes('正常') && tags.length > 1) reject('正常口味不能和其他口味倾向同时选择。')
    if (staple && !STAPLES.includes(staple)) reject('主食选项无效。')
    savedTaste = { spicy: level(taste.spicy, '辣度'), tags, staple }
  }
  return { itemSchemaVersion: 2, locationType, school, campus, region, areaId, taste: savedTaste, priceBasis }
}
module.exports = { extension, DISTRICTS, CAMPUSES }

