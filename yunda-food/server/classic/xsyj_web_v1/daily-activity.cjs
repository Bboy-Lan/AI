// Server-side authority for daily check-ins, activity levels, publishing quota and admin overrides.
// Pure helpers mirror src/domain/daily-level.ts; both read the same JSON rule table and are pinned
// together by tests/daily-level.test.ts. Everything that writes or authorises lives here, never in the UI.
const rules = require('./daily-level-rules.json')
const LEVELS = rules.levels.map(level => ({ ...level, maxDays: level.maxDays == null ? null : level.maxDays }))
const MESSAGES = rules.messages
const MAX = rules.maxOverrideLimit
const DEFAULT_COLLECTIONS = { profiles: 'xsyj_profiles', items: 'xsyj_food_items', events: 'xsyj_events' }
const EVENT_TYPE = 'daily_quota_override'

function chinaDay(at = Date.now()) {
  const time = at instanceof Date ? at.getTime() : at
  const china = new Date(time + 8 * 60 * 60 * 1000)
  return `${china.getUTCFullYear()}-${String(china.getUTCMonth() + 1).padStart(2, '0')}-${String(china.getUTCDate()).padStart(2, '0')}`
}
function shiftDay(day, delta) {
  const time = Date.parse(day + 'T00:00:00Z')
  if (!Number.isFinite(time)) return day
  return new Date(time + delta * 86400000).toISOString().slice(0, 10)
}
function text(value, max) { return String(value == null ? '' : value).trim().slice(0, max || 120) }
function stamp(value) { return value ? new Date(value.$date || value).toISOString() : '' }
function readStreak(row) {
  const value = row && row.activityStreak
  return Number.isInteger(value) && value > 0 ? value : 0
}
function levelFor(streak) {
  const days = Math.max(0, Math.floor(Number(streak) || 0))
  for (let i = LEVELS.length - 1; i >= 0; i--) if (days >= LEVELS[i].minDays) return LEVELS[i]
  return LEVELS[0]
}
function progressToNext(streak) {
  const days = Math.max(0, Math.floor(Number(streak) || 0))
  const level = levelFor(days), index = LEVELS.indexOf(level), next = LEVELS[index + 1]
  return { index, total: LEVELS.length, level, next, daysToNext: next ? Math.max(0, next.minDays - days) : 0, nextTitle: next ? next.title : '', nextDailyLimit: next ? next.dailyLimit : 0 }
}
function streakAfter(lastDay, streak, day) {
  const base = readStreak({ activityStreak: streak })
  if (lastDay === day) return base
  if (!lastDay) return 1
  if (lastDay > day) return base
  return shiftDay(lastDay, 1) === day ? base + 1 : 1
}
function overrideActive(value, day) {
  return !!value && value.active === true && Number.isInteger(value.value) && value.value >= 0
    && value.value <= MAX && (!value.expiresOn || day <= value.expiresOn)
}
function formatMessage(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (_match, key) => vars[key] == null ? '' : String(vars[key]))
    .replace(/。\s*。+/g, '。').replace(/\s+/g, ' ').trim()
}
function levelProgressText(streak) {
  const progress = progressToNext(streak)
  return progress.nextTitle
    ? formatMessage(MESSAGES.levelProgress, { streak, nextTitle: progress.nextTitle, days: progress.daysToNext })
    : formatMessage(MESSAGES.levelProgressMaxed, { streak })
}
function quotaView(row, day, used) {
  const streak = readStreak(row), level = levelFor(streak), progress = progressToNext(streak)
  const override = (row && row.dailyQuotaOverride) || null, active = overrideActive(override, day)
  const limit = active && override ? override.value : level.dailyLimit
  const tomorrow = shiftDay(day, 1)
  const tomorrowOverride = active && override && (!override.expiresOn || tomorrow <= override.expiresOn)
  const tomorrowLimit = tomorrowOverride && override ? override.value : levelFor(streak + 1).dailyLimit
  const count = Math.max(0, Math.floor(Number(used) || 0)), remaining = Math.max(0, limit - count)
  const upgradeHint = progress.nextTitle
    ? formatMessage(MESSAGES.upgrade, { days: progress.daysToNext, nextTitle: progress.nextTitle, nextLimit: progress.nextDailyLimit })
    : formatMessage(MESSAGES.maxed, { title: level.title, limit })
  const expiry = active && override && override.expiresOn ? formatMessage(MESSAGES.expiry, { date: override.expiresOn }) : MESSAGES.expiryNever
  const overrideNote = active && override ? formatMessage(MESSAGES.overrideNote, { limit, expiry }) : ''
  const quotaHint = remaining > 0
    ? formatMessage(MESSAGES.quotaHint, { remaining, title: level.title })
    : formatMessage(MESSAGES.quotaHintExhausted, { title: level.title })
  const exhaustedMessage = remaining <= 0
    ? formatMessage(MESSAGES.exhausted, { title: level.title, used: count, limit, tomorrow: tomorrowLimit, upgrade: upgradeHint, overrideNote })
    : ''
  return {
    title: level.title, streak, daily_limit: level.dailyLimit, effective_limit: limit,
    used: count, remaining, tomorrow_limit: tomorrowLimit,
    next_title: progress.nextTitle, days_to_next: progress.daysToNext, next_daily_limit: progress.nextDailyLimit,
    level_index: progress.index, level_total: progress.total,
    override_active: active, override_value: active && override ? override.value : 0,
    override_reason: active && override ? override.reason : '',
    override_expires_on: active && override && override.expiresOn ? override.expiresOn : '',
    quota_hint: quotaHint, exhausted_message: exhaustedMessage, upgrade_hint: upgradeHint,
    level_progress: levelProgressText(streak)
  }
}
const pure = { chinaDay, shiftDay, readStreak, levelFor, progressToNext, streakAfter, overrideActive, formatMessage, quotaView, levelProgressText, titleFor: streak => levelFor(streak).title, dailyLimitFor: streak => levelFor(streak).dailyLimit, rules }

module.exports = function createDailyActivity(options) {
  const { db, fail, now, requireAdmin } = options
  const C = { ...DEFAULT_COLLECTIONS, ...(options.collections || {}) }
  const today = options.chinaDay || chinaDay
  const day = () => today()
  const profileByOwner = async uid => (await db.collection(C.profiles).where({ ownerOpenId: uid }).limit(1).get()).data[0] || null
  const profileById = async id => db.collection(C.profiles).doc(id).get().then(result => result.data).catch(() => null)
  const countToday = async (uid, date, size) => (await db.collection(C.items).where({ ownerOpenId: uid, submissionDay: date }).limit(size).get()).data.length

  // One successful check-in per Asia/Shanghai calendar day. Repeated loads never inflate the streak.
  async function checkIn(uid) {
    if (!uid) return null
    const row = await profileByOwner(uid)
    if (!row) return null
    const date = day(), last = typeof row.activityLastDay === 'string' ? row.activityLastDay : ''
    const streak = readStreak(row)
    if (last === date) return { day: date, streak, changed: false, row }
    const next = streakAfter(last, streak, date)
    await db.collection(C.profiles).doc(row._id).update({ data: { activityLastDay: date, activityStreak: next, activityUpdatedAt: now() } })
    return { day: date, streak: next, changed: true, row: { ...row, activityLastDay: date, activityStreak: next } }
  }
  async function quotaFor(row, date) {
    const key = date || day()
    const owner = row && row.ownerOpenId
    const limit = quotaView(row, key, 0).effective_limit
    const used = owner ? await countToday(owner, key, Math.max(1, limit + 1)) : 0
    return quotaView(row, key, used)
  }
  // This is the only gate that counts: the browser may hide a button, but submitItem always calls it.
  async function assertQuota(uid, row) {
    const key = day()
    const limit = quotaView(row, key, 0).effective_limit
    const used = await countToday(uid, key, Math.max(1, limit + 1))
    const view = quotaView(row, key, used)
    if (view.remaining <= 0) fail(view.exhausted_message)
    return view
  }
  function titleOf(row) { return levelFor(readStreak(row)).title }

  async function adminDetail(operatorUid, id) {
    await requireAdmin(operatorUid)
    const profileId = text(id, 100)
    if (!profileId) fail('缺少用户标识。')
    const row = await profileById(profileId)
    if (!row) fail('用户资料不存在。')
    const view = await quotaFor(row)
    const override = row.dailyQuotaOverride || null
    const records = await db.collection(C.events).where({ type: EVENT_TYPE, targetId: profileId }).limit(100).get()
    const history = records.data.slice().sort((a, b) => stamp(b.createdAt).localeCompare(stamp(a.createdAt))).slice(0, 10).map(record => ({
      operation: (record.snapshot && record.snapshot.operation) || 'set',
      value: Number((record.snapshot && record.snapshot.value) || 0),
      reason: record.reason || '',
      expiresOn: (record.snapshot && record.snapshot.expiresOn) || '',
      setBy: record.operatorOpenId || '',
      createdAt: stamp(record.createdAt)
    }))
    return { ...view, profile_id: profileId, override_set_by: override ? override.setBy || '' : '', override_set_at: override ? stamp(override.setAt) : '', history }
  }
  async function adminSet(operatorUid, payload) {
    await requireAdmin(operatorUid)
    const profileId = text(payload.id, 100)
    if (!profileId) fail('缺少用户标识。')
    const row = await profileById(profileId)
    if (!row) fail('用户资料不存在。')
    const reason = text(payload.reason, 120)
    if (reason.length < 2) fail('请填写至少2个字的原因。')
    const operation = payload.operation === 'clear' ? 'clear' : 'set'
    const date = day(), at = now()
    let override
    if (operation === 'set') {
      const value = Number(payload.value)
      if (!Number.isInteger(value) || value < 0 || value > MAX) fail(`每日额度需为 0～${MAX} 的整数。`)
      const expiresOn = payload.expiresOn ? text(payload.expiresOn, 10) : ''
      if (expiresOn && (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) || expiresOn < date)) fail('失效日期需为今天或之后的日期（YYYY-MM-DD）。')
      override = { active: true, value, reason, expiresOn, setBy: operatorUid, setAt: at }
    } else {
      // Never store null here: CloudBase document updates on a previously-object field reject it.
      override = { active: false, value: 0, reason, expiresOn: '', setBy: operatorUid, setAt: at, clearedBy: operatorUid, clearedAt: at }
    }
    await db.collection(C.profiles).doc(profileId).update({ data: { dailyQuotaOverride: override } })
    await db.collection(C.events).add({ data: {
      type: EVENT_TYPE, operatorOpenId: operatorUid, targetType: 'profile', targetId: profileId,
      reason, snapshot: { operation, value: override.value, expiresOn: override.expiresOn, before: row.dailyQuotaOverride || null, after: override }, createdAt: at
    } })
    return adminDetail(operatorUid, profileId)
  }
  return { pure, checkIn, quotaFor, assertQuota, adminDetail, adminSet, titleOf, countToday, chinaDay: day }
}
module.exports.pure = pure
