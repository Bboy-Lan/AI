// Daily activity levels and per-day publishing quota. Rules and copy live in one JSON file that the
// CloudBase CJS runtime and this browser-side module both read, so thresholds can never drift apart.
import rules from '../../server/classic/xsyj_web_v1/daily-level-rules.json'

export type LevelRule = { minDays: number, maxDays: number | null, title: string, dailyLimit: number, minExp: number }
export const LEVELS: LevelRule[] = rules.levels.map(level => ({ ...level, maxDays: level.maxDays ?? null }))
export const DEFAULT_TITLE: string = rules.defaultTitle
export const DEFAULT_DAILY_LIMIT: number = rules.defaultDailyLimit
export const MAX_OVERRIDE_LIMIT: number = rules.maxOverrideLimit
export const TIMEZONE: string = rules.timezone
export const MESSAGES: Record<string, string> = rules.messages
export const EXP_RULES = rules.exp
/** Badge tier comes from the title only; growth points never change it. */
export function tierOfTitle(title: string): number {
  const index = LEVELS.findIndex(level => level.title === title)
  return index < 0 ? 0 : index
}

export type DailyOverride = {
  active: boolean, value: number, reason: string, expiresOn?: string,
  setBy?: string, setAt?: unknown, clearedBy?: string, clearedAt?: unknown
}
export type QuotaRow = {
  activityLastDay?: string | null, activityStreak?: number | null,
  activityExp?: number | null, activityExpDay?: string | null, activityExpToday?: number | null,
  dailyQuotaOverride?: DailyOverride | null, accountStatus?: string
}
export type DailyLevelView = {
  title: string, streak: number, daily_limit: number, effective_limit: number,
  used: number, remaining: number, tomorrow_limit: number,
  next_title: string, days_to_next: number, next_daily_limit: number,
  level_index: number, level_total: number,
  override_active: boolean, override_value: number, override_reason: string, override_expires_on: string,
  quota_hint: string, exhausted_message: string, upgrade_hint: string, level_progress: string,
  exp: number, exp_today: number, exp_cap: number, exp_step: number, exp_progress: number,
  exp_note: string, exp_hint: string,
  override_set_by?: string, override_set_at?: string,
  history?: { operation: string, value: number, reason: string, expiresOn: string, setBy: string, createdAt: string }[]
}

/** Asia/Shanghai calendar day. UTC+8 has no DST, so a fixed offset is exact. */
export function chinaDay(at: number | Date = Date.now()): string {
  const time = at instanceof Date ? at.getTime() : at
  const china = new Date(time + 8 * 60 * 60 * 1000)
  return `${china.getUTCFullYear()}-${String(china.getUTCMonth() + 1).padStart(2, '0')}-${String(china.getUTCDate()).padStart(2, '0')}`
}
export function shiftDay(day: string, delta: number): string {
  const time = Date.parse(day + 'T00:00:00Z')
  if (!Number.isFinite(time)) return day
  return new Date(time + delta * 86400000).toISOString().slice(0, 10)
}
/** Missing or corrupt legacy rows must never raise a user above the entry level. */
export function readStreak(row: QuotaRow | null | undefined): number {
  const value = row?.activityStreak
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0
}
export function levelFor(streak: number): LevelRule {
  const days = Math.max(0, Math.floor(Number(streak) || 0))
  for (let i = LEVELS.length - 1; i >= 0; i--) if (days >= LEVELS[i].minDays) return LEVELS[i]
  return LEVELS[0]
}
export function expOf(row: QuotaRow | null | undefined): number {
  return Math.max(0, Math.floor(Number(row?.activityExp) || 0))
}
/** Highest tier unlocked by consecutive days OR (from day 7) by accumulated growth points. */
export function activityLevel(streak: number, exp = 0): LevelRule {
  const days = Math.max(0, Math.floor(Number(streak) || 0))
  const points = Math.max(0, Math.floor(Number(exp) || 0))
  let level = LEVELS[0]
  for (const candidate of LEVELS) {
    const byDays = days >= candidate.minDays
    const byExp = days >= EXP_RULES.unlockDay && candidate.minExp > 0 && points >= candidate.minExp
    if (byDays || byExp) level = candidate
  }
  return level
}
export function titleFor(streak: number, exp = 0): string { return activityLevel(streak, exp).title }
export function dailyLimitFor(streak: number, exp = 0): number { return activityLevel(streak, exp).dailyLimit }

/** One check-in per calendar day; a gap resets the streak to 1, never to 0 after a real check-in. */
export function streakAfter(lastDay: string | null | undefined, streak: number, day: string): number {
  const base = readStreak({ activityStreak: streak })
  if (lastDay === day) return base
  if (!lastDay) return 1
  if (lastDay > day) return base
  return shiftDay(lastDay, 1) === day ? base + 1 : 1
}
export function progressToNext(streak: number, exp = 0) {
  const days = Math.max(0, Math.floor(Number(streak) || 0))
  const points = Math.max(0, Math.floor(Number(exp) || 0))
  const level = activityLevel(days, points), index = LEVELS.indexOf(level), next = LEVELS[index + 1]
  const expTarget = next?.minExp || 0
  return {
    index, total: LEVELS.length, level, next,
    daysToNext: next ? Math.max(0, next.minDays - days) : 0,
    nextTitle: next?.title || '', nextDailyLimit: next?.dailyLimit || 0,
    expTarget, expGap: next ? Math.max(0, expTarget - points) : 0,
    expAvailable: !!next && days >= EXP_RULES.unlockDay && expTarget > 0,
    spanStart: level.minDays, spanEnd: level.maxDays
  }
}
export function overrideActive(value: DailyOverride | null | undefined, day: string): boolean {
  return !!value && value.active === true && Number.isInteger(value.value) && value.value >= 0
    && value.value <= MAX_OVERRIDE_LIMIT && (!value.expiresOn || day <= value.expiresOn)
}
export function formatMessage(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => vars[key] == null ? '' : String(vars[key]))
    .replace(/。\s*。+/g, '。').replace(/\s+/g, ' ').trim()
}
export function levelProgressText(streak: number, exp = 0): string {
  const progress = progressToNext(streak, exp), points = Math.max(0, Math.floor(Number(exp) || 0))
  return progress.nextTitle
    ? formatMessage(MESSAGES.levelProgress, { streak, exp: points, nextTitle: progress.nextTitle, days: progress.daysToNext })
    : formatMessage(MESSAGES.levelProgressMaxed, { streak, exp: points })
}

/** Pure view used by the browser, demo backend and the CJS runtime guard tests. */
export function quotaView(row: QuotaRow | null | undefined, day: string, used = 0): DailyLevelView {
  const streak = readStreak(row), exp = expOf(row)
  const level = activityLevel(streak, exp), progress = progressToNext(streak, exp)
  const override = row?.dailyQuotaOverride || null, active = overrideActive(override, day)
  const limit = active && override ? override.value : level.dailyLimit
  const tomorrow = shiftDay(day, 1)
  const tomorrowOverride = active && override && (!override.expiresOn || tomorrow <= override.expiresOn)
  const tomorrow_limit = tomorrowOverride && override ? override.value : activityLevel(streak + 1, exp).dailyLimit
  const count = Math.max(0, Math.floor(Number(used) || 0)), remaining = Math.max(0, limit - count)
  const exp_today = row?.activityExpDay === day ? Math.max(0, Math.floor(Number(row.activityExpToday) || 0)) : 0
  const exp_step = Math.max(1, Number(EXP_RULES.step) || 30)
  const exp_progress = Math.min(99, Math.round((exp % exp_step) / exp_step * 100))
  const upgrade_hint = progress.nextTitle
    ? (progress.expAvailable && progress.expGap > 0
      ? formatMessage(MESSAGES.upgradeWithExp, { days: progress.daysToNext, expTarget: progress.expTarget, expGap: progress.expGap, nextTitle: progress.nextTitle })
      : formatMessage(MESSAGES.upgrade, { days: progress.daysToNext, nextTitle: progress.nextTitle, nextLimit: progress.nextDailyLimit }))
    : formatMessage(MESSAGES.maxed, { title: level.title, limit })
  const expiry = active && override?.expiresOn ? formatMessage(MESSAGES.expiry, { date: override.expiresOn }) : MESSAGES.expiryNever
  const overrideNote = active && override ? formatMessage(MESSAGES.overrideNote, { limit, expiry }) : ''
  const quota_hint = remaining > 0
    ? formatMessage(MESSAGES.quotaHint, { remaining, title: level.title })
    : formatMessage(MESSAGES.quotaHintExhausted, { title: level.title })
  const exhausted_message = remaining <= 0
    ? formatMessage(MESSAGES.exhausted, { title: level.title, used: count, limit, tomorrow: tomorrow_limit, upgrade: upgrade_hint, overrideNote })
    : ''
  return {
    title: level.title, streak, daily_limit: level.dailyLimit, effective_limit: limit,
    used: count, remaining, tomorrow_limit,
    next_title: progress.nextTitle, days_to_next: progress.daysToNext, next_daily_limit: progress.nextDailyLimit,
    level_index: progress.index, level_total: progress.total,
    override_active: active, override_value: active && override ? override.value : 0,
    override_reason: active && override ? override.reason : '',
    override_expires_on: active && override?.expiresOn ? override.expiresOn : '',
    quota_hint, exhausted_message, upgrade_hint, level_progress: levelProgressText(streak, exp),
    exp, exp_today, exp_cap: EXP_RULES.dailyCap, exp_step, exp_progress,
    exp_note: MESSAGES.expNote || '',
    exp_hint: formatMessage(MESSAGES.expHint || '', { exp, today: exp_today, cap: EXP_RULES.dailyCap })
  }
}
