import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {memoryDb} from './support/memory-db'
import {LEVELS,levelFor,activityLevel,quotaView,chinaDay,shiftDay,streakAfter,progressToNext,titleFor} from '../src/domain/daily-level'
import {createDemoState} from '../src/demo/fixtures'
import {createDemoRepository} from '../src/demo/repository'

const require = createRequire(import.meta.url)
const createDailyActivity = require('../server/classic/xsyj_web_v1/daily-activity.cjs')
const pure = createDailyActivity.pure
const rules = require('../server/classic/xsyj_web_v1/daily-level-rules.json')
const createService = require('../server/classic/xsyj_web_v1/service.cjs')
const read = (file: string) => readFileSync(file, 'utf8')
const DAY = '2026-11-10'
const profile = (extra: Record<string, unknown> = {}) => ({ _id: 'p1', ownerOpenId: 'u1', foodieId: '同学甲', hometown: '云南省昆明市', avatarFileId: 'cloud://avatar', moderationStatus: 'active', ...extra })

function setup(initial = DAY) {
  let day = initial
  const m = memoryDb()
  const fail = (message: string) => { const error: any = Error(message); error.publicMessage = message; throw error }
  const service = createDailyActivity({
    db: m.db, fail, now: () => new Date(day + 'T04:00:00Z'), chinaDay: () => day,
    requireAdmin: async (uid: string) => { if (uid !== 'admin') fail('无管理员权限。') },
    collections: { profiles: 'xsyj_profiles', items: 'xsyj_food_items', events: 'xsyj_events' }
  })
  return { service, ...m, now: () => day, setDay: (value: string) => { day = value } }
}
const foodPayload = (requestId: string) => ({ name: '演示新投稿', venue: '示例窗口', price: 12, category: '正餐', locationType: 'inside', priceBasis: 'portion', school: '云南大学', campus: '东陆校区', taste: { spicy: 1, tags: [], staple: '米线' }, images: ['/assets/demo/noodles.svg'], description: '演示推荐理由，至少十个字，用于验证每日额度。', authorAte: true, clientRequestId: requestId })

test('等级阈值与额度集中在一份规则表，称号不出现 Utral 拼写', () => {
  assert.equal(rules.timezone, 'Asia/Shanghai')
  assert.deepEqual(rules.levels.map((l: any) => [l.minDays, l.maxDays, l.title, l.dailyLimit]), [
    [1, 6, '小吃货', 1], [7, 13, '小吃货 Min', 2], [14, 20, '小吃货 Plus', 3], [21, 27, '小吃货 Pro', 3], [28, null, '小吃货 Ultra', 3]
  ])
  assert.deepEqual(LEVELS.map(l => l.title), rules.levels.map((l: any) => l.title))
  const sources = [read('src/domain/daily-level.ts'), read('src/components/RoleBadge.tsx'), read('src/app/App.tsx'), read('src/styles/app.css'), JSON.stringify(rules)].join('\n')
  assert.ok(!/Utral/i.test(sources))
  assert.ok(sources.includes('小吃货 Ultra'))
})

test('等级计算覆盖 0/1/6/7/13/14/20/21/27/28/100 天边界', () => {
  const cases: [number, string, number][] = [
    [0, '小吃货', 1], [1, '小吃货', 1], [6, '小吃货', 1], [7, '小吃货 Min', 2], [13, '小吃货 Min', 2],
    [14, '小吃货 Plus', 3], [20, '小吃货 Plus', 3], [21, '小吃货 Pro', 3], [27, '小吃货 Pro', 3], [28, '小吃货 Ultra', 3], [100, '小吃货 Ultra', 3]
  ]
  for (const [days, title, limit] of cases) {
    assert.equal(levelFor(days).title, title, `${days} 天称号`)
    assert.equal(levelFor(days).dailyLimit, limit, `${days} 天额度`)
    assert.equal(pure.levelFor(days).title, title, 'CJS 与 TS 等级一致')
    assert.equal(titleFor(days), title)
  }
  assert.equal(progressToNext(1).daysToNext, 6)
  assert.equal(progressToNext(6).daysToNext, 1)
  assert.equal(progressToNext(28).nextTitle, '')
})

test('Asia/Shanghai 自然日与连续签到：同日不增加、连续 +1、中断从 1 重来', () => {
  assert.equal(chinaDay(new Date('2026-11-10T15:59:00Z')), '2026-11-10')
  assert.equal(chinaDay(new Date('2026-11-10T16:00:00Z')), '2026-11-11')
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01')
  assert.equal(streakAfter('2026-12-31', 5, '2027-01-01'), 6, '跨年连续')
  assert.equal(streakAfter('2026-11-09', 6, '2026-11-10'), 7, '跨月连续')
  assert.equal(streakAfter('2026-11-10', 7, '2026-11-10'), 7, '同一天重复签到')
  assert.equal(streakAfter('2026-11-01', 9, '2026-11-10'), 1, '中断后从 1 重来')
  assert.equal(streakAfter('', 0, '2026-11-10'), 1, '旧数据首次签到')
})

test('服务端真实签到写库：同日重复不增加、连续与中断都按自然日累计', async () => {
  const ctx = setup()
  ctx.seed('xsyj_profiles', [profile()])
  const first = await ctx.service.checkIn('u1')
  assert.equal(first.streak, 1); assert.equal(first.changed, true)
  const again = await ctx.service.checkIn('u1')
  assert.equal(again.streak, 1); assert.equal(again.changed, false, '同一天重复签到不增加')
  ctx.setDay('2026-11-11')
  assert.equal((await ctx.service.checkIn('u1')).streak, 2)
  ctx.setDay('2026-11-13')
  assert.equal((await ctx.service.checkIn('u1')).streak, 1, '断签后从 1 天重新累计')
  assert.equal(ctx.rows('xsyj_profiles')[0].activityLastDay, '2026-11-13')
  assert.equal(ctx.rows('xsyj_profiles')[0].activityStreak, 1)
})

test('每日额度按自然日统计，耗尽时服务端拒绝并给出称号/明日额度/升级条件', async () => {
  const s = setup()
  s.seed('xsyj_profiles', [profile({ activityLastDay: DAY, activityStreak: 1 })])
  const row = s.rows('xsyj_profiles')[0]
  const free = await s.service.quotaFor(row)
  assert.equal(free.effective_limit, 1); assert.equal(free.remaining, 1); assert.equal(free.used, 0)
  s.seed('xsyj_food_items', [{ _id: 'f1', ownerOpenId: 'u1', submissionDay: DAY, status: 'published' }])
  await assert.rejects(() => s.service.assertQuota('u1', row), /今日发布额度已用完/)
  const exhausted = quotaView(row, DAY, 1).exhausted_message
  for (const text of ['今日发布额度已用完', '小吃货', '明日可用 1 条', '升级', '小吃货 Min']) assert.ok(exhausted.includes(text), text)
  assert.equal(pure.quotaView(row, DAY, 1).exhausted_message, exhausted, 'CJS 与 TS 文案一致')
  s.setDay('2026-11-11')
  const next = await s.service.quotaFor({ ...row, activityLastDay: '2026-11-11', activityStreak: 2 })
  assert.equal(next.used, 0, '跨日重置：昨天的投稿不计入今天')
  assert.equal(next.remaining, 1)
})

test('管理员覆写优先于等级额度，取消立即恢复，过期自动失效，审计完整', async () => {
  const s = setup()
  s.seed('xsyj_profiles', [profile({ activityLastDay: DAY, activityStreak: 1 })])
  await assert.rejects(() => s.service.adminSet('u1', { id: 'p1', operation: 'set', value: 5, reason: '越权尝试' }), /无管理员权限/)
  await assert.rejects(() => s.service.adminDetail('u1', 'p1'), /无管理员权限/)
  const set = await s.service.adminSet('admin', { id: 'p1', operation: 'set', value: 5, reason: '活动期间放宽额度', expiresOn: '2026-11-12' })
  assert.equal(set.title, '小吃货'); assert.equal(set.daily_limit, 1); assert.equal(set.effective_limit, 5)
  assert.equal(set.override_active, true); assert.equal(set.override_set_by, 'admin')
  assert.ok(set.override_set_at); assert.equal(set.history.length, 1)
  assert.equal(set.tomorrow_limit, 5, '未过期的覆写明日仍生效')
  s.seed('xsyj_food_items', [0, 1, 2, 3].map(i => ({ _id: 'q' + i, ownerOpenId: 'u1', submissionDay: DAY })))
  const raised = await s.service.quotaFor(s.rows('xsyj_profiles')[0])
  assert.equal(raised.remaining, 1, '覆写提高额度后可以继续发布')
  await s.service.assertQuota('u1', s.rows('xsyj_profiles')[0])
  s.seed('xsyj_food_items', [{ _id: 'q4', ownerOpenId: 'u1', submissionDay: DAY }])
  await assert.rejects(() => s.service.assertQuota('u1', s.rows('xsyj_profiles')[0]), /今日发布额度已用完/)
  const cleared = await s.service.adminSet('admin', { id: 'p1', operation: 'clear', reason: '活动结束恢复默认' })
  assert.equal(cleared.effective_limit, 1, '取消覆写后立即恢复等级默认')
  assert.equal(cleared.override_active, false); assert.equal(cleared.history.length, 2)
  const events = s.rows('xsyj_events').filter((e: any) => e.type === 'daily_quota_override')
  assert.equal(events.length, 2)
  assert.equal(events[0].operatorOpenId, 'admin'); assert.equal(events[0].targetId, 'p1')
  assert.equal(events[0].snapshot.expiresOn, '2026-11-12'); assert.equal(events[0].snapshot.value, 5)
  assert.ok(events[0].createdAt, '审计保留设置时间')
  await s.service.adminSet('admin', { id: 'p1', operation: 'set', value: 9, reason: '临时额度', expiresOn: DAY })
  s.setDay('2026-11-11')
  const expired = await s.service.adminDetail('admin', 'p1')
  assert.equal(expired.override_active, false, '失效日期次日起覆写不再生效')
  assert.equal(expired.effective_limit, 1)
})

test('旧用户缺少签到/等级/覆写字段时按小吃货 + 1 条/日处理，不破坏旧数据', async () => {
  const s = setup()
  s.seed('xsyj_profiles', [profile()])
  const row = s.rows('xsyj_profiles')[0]
  assert.equal(row.activityStreak, undefined)
  assert.equal(s.service.titleOf(row), '小吃货')
  const view = await s.service.quotaFor(row)
  assert.equal(view.title, '小吃货'); assert.equal(view.streak, 0); assert.equal(view.effective_limit, 1)
  const checked = await s.service.checkIn('u1')
  assert.equal(checked.streak, 1)
  assert.equal(s.rows('xsyj_profiles')[0].foodieId, '同学甲', '签到只新增字段，不改原有资料')
  assert.equal(s.rows('xsyj_profiles')[0].ownerOpenId, 'u1')
})

test('服务端纯函数与前端领域层对所有等级和覆写组合逐项一致', () => {
  for (const streak of [0, 1, 6, 7, 13, 14, 20, 21, 27, 28, 60]) {
    assert.deepEqual(pure.quotaView({ activityStreak: streak }, DAY, streak % 3), quotaView({ activityStreak: streak }, DAY, streak % 3), `streak=${streak}`)
    assert.equal(pure.progressToNext(streak).daysToNext, progressToNext(streak).daysToNext)
  }
  const override = { active: true, value: 8, reason: '测试', expiresOn: '2026-11-12', setBy: 'admin', setAt: DAY }
  assert.deepEqual(pure.quotaView({ activityStreak: 7, dailyQuotaOverride: override }, DAY, 2), quotaView({ activityStreak: 7, dailyQuotaOverride: override }, DAY, 2))
  assert.deepEqual(pure.quotaView({ activityStreak: 7, dailyQuotaOverride: override }, '2026-11-13', 0), quotaView({ activityStreak: 7, dailyQuotaOverride: override }, '2026-11-13', 0))
})

test('service.cjs 的 admin* 权限在后端，普通用户不能读或改他人覆写', async () => {
  const m = memoryDb()
  m.seed('xsyj_profiles', [profile({ _id: 'p-target', ownerOpenId: 'target' }), profile()])
  const fail = (message: string) => { const e: any = Error(message); e.publicMessage = message; throw e }
  const dailyActivity = createDailyActivity({ db: m.db, fail, now: () => new Date(DAY + 'T04:00:00Z'), chinaDay: () => DAY, requireAdmin: async (uid: string) => { if (uid !== 'admin') fail('无管理员权限。') } })
  const service = createService({
    dependencies: { hash: () => 'fixed-hash', db: m.db, dailyActivity, noticesEnabled: false, profileFor: async (uid: string) => m.rows('xsyj_profiles').find((p: any) => p.ownerOpenId === uid) || null, adminFor: async (uid: string) => uid === 'admin' ? {} : null, requireProfile: async () => ({}) },
    cautions: {}, dispatch: async () => []
  })
  await assert.rejects(() => service({ uid: 'u1' }, 'adminDailyQuotaDetail', { id: 'p-target' }), /无管理员权限/)
  await assert.rejects(() => service({ uid: 'u1' }, 'adminSetDailyQuota', { id: 'p-target', operation: 'set', value: 9, reason: '越权尝试' }), /无管理员权限/)
  assert.equal(m.rows('xsyj_profiles').find((p: any) => p._id === 'p-target').dailyQuotaOverride, undefined, '越权没有写入任何覆写')
  const context = await service({ uid: 'u1' }, 'context', {})
  assert.equal(context.profile.daily_level.title, '小吃货', 'context 只回自己的等级')
  assert.equal(context.profile.daily_level.override_set_by, undefined, '自己的视图不含他人覆写信息')
  const adminView = await service({ uid: 'admin' }, 'adminDailyQuotaDetail', { id: 'p-target' })
  assert.equal(adminView.profile_id, 'p-target')
})

test('本地模拟数据：第 1/7/14 天、额度耗尽、管理员提高/取消/覆写过期', () => {
  const clock = (day: string) => () => new Date(day + 'T04:00:00Z')
  const first = createDemoRepository(createDemoState('student'), () => {}, { now: clock(DAY) })
  const day1 = first.rpc<any>('context').profile.daily_level
  assert.equal(day1.streak, 1); assert.equal(day1.title, '小吃货'); assert.equal(day1.effective_limit, 1); assert.equal(day1.remaining, 1)
  first.rpc('saveFood', foodPayload('quota-food-0001'))
  assert.equal(first.rpc<any>('context').profile.daily_level.remaining, 0)
  assert.throws(() => first.rpc('saveFood', foodPayload('quota-food-0002')), /今日发布额度已用完/)
  for (const [streak, title, limit] of [[7, '小吃货 Min', 2], [14, '小吃货 Plus', 3]] as const) {
    const state = createDemoState('student')
    state.daily = { checkIns: { [state.actor]: { lastDay: '2026-11-09', streak: streak - 1 } }, overrides: {}, events: [] }
    const repo = createDemoRepository(state, () => {}, { now: clock(DAY) })
    const view = repo.rpc<any>('context').profile.daily_level
    assert.equal(view.streak, streak); assert.equal(view.title, title); assert.equal(view.effective_limit, limit)
  }
  const raised = createDemoState('student')
  raised.daily = { checkIns: { [raised.actor]: { lastDay: DAY, streak: 1 } }, overrides: { [raised.actor]: { active: true, value: 4, reason: '管理员提高额度', expiresOn: '2026-11-12', setBy: 'demo-admin', setAt: DAY } }, events: [] }
  const repo = createDemoRepository(raised, () => {}, { now: clock(DAY) })
  assert.equal(repo.rpc<any>('context').profile.daily_level.effective_limit, 4)
  for (let i = 0; i < 4; i++) repo.rpc('saveFood', foodPayload('raised-food-000' + i))
  assert.throws(() => repo.rpc('saveFood', foodPayload('raised-food-9999')), /今日发布额度已用完/)
  const expired = createDemoState('student')
  expired.daily = { checkIns: { [expired.actor]: { lastDay: DAY, streak: 1 } }, overrides: { [expired.actor]: { active: true, value: 4, reason: '已过期', expiresOn: '2026-11-09', setBy: 'demo-admin', setAt: DAY } }, events: [] }
  assert.equal(createDemoRepository(expired, () => {}, { now: clock(DAY) }).rpc<any>('context').profile.daily_level.effective_limit, 1, '覆写过期回落等级额度')
  const admin = createDemoRepository(createDemoState('admin'), () => {}, { now: clock(DAY) })
  admin.rpc('adminSetDailyQuota', { id: 'demo-student', operation: 'set', value: 6, reason: '活动放宽额度', expiresOn: '2026-11-12' })
  let detail = admin.rpc<any>('adminDailyQuotaDetail', { id: 'demo-student' })
  assert.equal(detail.effective_limit, 6); assert.equal(detail.history.length, 1); assert.equal(detail.override_set_by, 'demo-admin')
  admin.rpc('adminSetDailyQuota', { id: 'demo-student', operation: 'clear', reason: '活动结束' })
  detail = admin.rpc<any>('adminDailyQuotaDetail', { id: 'demo-student' })
  assert.equal(detail.effective_limit, 1, '取消覆写恢复默认'); assert.equal(detail.history.length, 2)
  assert.throws(() => createDemoRepository(createDemoState('student'), () => {}, { now: clock(DAY) }).rpc('adminDailyQuotaDetail', { id: 'demo-student' }), /管理员/)
})

test('服务端发布额度不再硬编码 3 条，管理员动作与签到挂在正确位置', () => {
  const native = read('server/classic/xsyj_web_v1/native/food/index.js')
  const service = read('server/classic/xsyj_web_v1/service.cjs')
  assert.ok(!/dailyCount\(C\.items, id, submissionDay, 3\)/.test(native), '旧硬编码 3 条额度应移除')
  assert.match(native, /await dailyActivity\.assertQuota\(id, profile\)/, '发布必须走服务端额度校验')
  assert.match(native, /exports\.dependencies=\{[^}]*dailyActivity/, '额度能力需注入 service 层')
  assert.match(service, /case 'adminDailyQuotaDetail':/)
  assert.match(service, /case 'adminSetDailyQuota':/)
  assert.match(service, /action\.startsWith\('admin'\)&&!admin\)fail\('无管理员权限。'\)/, '后端统一 admin 鉴权')
  assert.match(service, /case 'context':\{[^}]*da\.checkIn\(uid\)/, 'context 幂等签到')
  assert.match(service, /authorTitle:author&&d\.dailyActivity\?d\.dailyActivity\.titleOf\(author\)/, '作者称号随推荐 DTO 下发')
  assert.match(read('src/services/cloud.ts'), /'adminDailyQuotaDetail'/, '新增只读动作加入 reads 白名单')
})

test('推荐卡价格不可断行/不收缩，列表紧凑纵向流，双列内部结构一致', () => {
  const css = read('src/styles/app.css'), app = read('src/app/App.tsx')
  const priceRule = css.split('\n').find(line => line.startsWith('.price{')) || ''
  for (const part of ['display:inline-flex', 'white-space:nowrap', 'min-width:58px', 'flex:0 0 auto']) assert.ok(priceRule.includes(part), '价格单元缺少 ' + part)
  assert.match(css, /\.price-unit\{[^}]*display:inline[^}]*white-space:nowrap/, '单位与金额同一行')
  assert.match(css, /\.food-title-row \.price\{flex:0 0 auto\}/, '价格列不收缩')
  assert.match(css, /\.food-title-row \.price,\.food-row-title \.price\{[^}]*min-width:58px/)
  for (const rule of ['.food-title-row{', '.food-row-title{', '.food-card .food-author{']) {
    const line = css.split('\n').find(l => l.startsWith(rule)) || ''
    assert.ok(!line.includes('space-between'), rule + ' 不应再把内容强制拉开')
  }
  assert.match(css, /\.food-row-body\{[^}]*gap:4px/, '标题与店名保持 4–8px 小间距')
  assert.match(css, /\.food-row-body \.store-name\{[^}]*margin:0/, '移除店名的多余外边距')
  assert.match(css, /\.food-grid-view\{[^}]*repeat\(2,minmax\(0,1fr\)\)[^}]*align-items:stretch/, '双列左右对齐')
  const tileTitle = css.split('\n').find(line => line.startsWith('.food-tile-body strong{')) || ''
  assert.ok(tileTitle.includes('line-clamp:2'), '双列标题最多两行')
  assert.ok(tileTitle.includes('min-height:2.9em'), '双列标题固定节奏')
  assert.match(css, /\.food-byline\{[^}]*white-space:nowrap[^}]*text-overflow:ellipsis/, '店名/推荐人单行省略')
  assert.match(css, /\.home\{padding-bottom:calc\(var\(--nav-height\)/, '首页保留底部导航与发布按钮的安全间距')
  assert.match(css, /@media\(max-width:360px\)\{\.food-grid-view\{gap:7px\}/, '窄屏卡片规则')
  assert.match(app, /function PriceUnit\(/)
  assert.match(app, /function FoodByline\(/)
  assert.equal((app.match(/<PriceUnit food=\{food\}/g) || []).length, 3, '三种视图共用同一价格单元')
  assert.match(app, /<FoodByline food=\{food\}\/>/, '双列卡有店名/推荐人行')
  assert.match(app, /title=\{food\.authorTitle\}/, '作者附近展示紧凑称号')
  assert.match(app, /\{\(author\|\|food\.ratingCount\)\?<p className="food-author"/, '无作者信息时不留大块空白')
  assert.match(read('src/components/RoleBadge.tsx'), /level-badge/)
  assert.match(read('src/components/AdminProfilePanel.tsx'), /每日发布额度/)
  assert.match(read('src/pages/CloudPages.tsx'), /<LevelPage level=/)
  assert.match(read('src/pages/CloudCompose.tsx'), /quota-hint/)
  assert.ok(!/Utral/i.test(app + css + read('src/components/RoleBadge.tsx')))
})

test('并发签到不会让连续天数多涨，旧字段用户首次签到只记 1 天', async () => {
  const s = setup()
  s.seed('xsyj_profiles', [profile()])
  const [a, b] = await Promise.all([s.service.checkIn('u1'), s.service.checkIn('u1')])
  assert.ok(a && b)
  assert.equal(a.streak, 1); assert.equal(b.streak, 1)
  assert.equal(s.rows('xsyj_profiles')[0].activityStreak, 1, '并发重复写落库仍是 1 天')
  assert.equal((await s.service.checkIn('u1')).changed, false, '同日第三次不再写库')
})

test('覆写参数在服务端逐项校验，0 条额度同样禁止发布', async () => {
  const s = setup()
  s.seed('xsyj_profiles', [profile({ activityLastDay: DAY, activityStreak: 14 })])
  const row = () => s.rows('xsyj_profiles')[0]
  for (const value of [21, -1, 1.5]) await assert.rejects(() => s.service.adminSet('admin', { id: 'p1', operation: 'set', value, reason: '超出范围' }), /0～20/)
  const optionalReason = await s.service.adminSet('admin', { id: 'p1', operation: 'set', value: 5 })
  assert.equal(optionalReason.override_active, true, '原因改为可选，管理员不必填理由')
  await assert.rejects(() => s.service.adminSet('admin', { id: 'p1', operation: 'set', value: 5, reason: '过期日期', expiresOn: '2026-11-09' }), /失效日期/)
  await assert.rejects(() => s.service.adminSet('admin', { id: 'p1', operation: 'set', value: 5, reason: '格式错误', expiresOn: '2026/11/12' }), /失效日期/)
  const zero = await s.service.adminSet('admin', { id: 'p1', operation: 'set', value: 0, reason: '临时关闭发布' })
  assert.equal(zero.effective_limit, 0)
  assert.equal(zero.title, '小吃货 Plus', '覆写不改变称号')
  assert.equal(zero.daily_limit, 3, '等级默认额度仍保留')
  await assert.rejects(() => s.service.assertQuota('u1', row()), /今日发布额度已用完/)
  const restored = await s.service.adminSet('admin', { id: 'p1', operation: 'clear', reason: '恢复发布' })
  assert.equal(restored.effective_limit, 3)
})

test('覆写在到期当天仍有效，次日起失效且明日额度按等级计算', async () => {
  const s = setup()
  s.seed('xsyj_profiles', [profile({ activityLastDay: DAY, activityStreak: 1 })])
  await s.service.adminSet('admin', { id: 'p1', operation: 'set', value: 6, reason: '当天到期', expiresOn: DAY })
  const today = await s.service.adminDetail('admin', 'p1')
  assert.equal(today.override_active, true); assert.equal(today.effective_limit, 6)
  assert.equal(today.tomorrow_limit, 1, '明日覆写已过期，按等级额度')
  s.setDay('2026-11-11')
  const tomorrow = await s.service.adminDetail('admin', 'p1')
  assert.equal(tomorrow.override_active, false); assert.equal(tomorrow.effective_limit, 1)
})

test('双通道升级：前 7 天锁死小吃货，满 7 天后成长值可加速升级，天数通道仍保底', () => {
  const cases: [number, number, string, number][] = [
    [1, 0, '小吃货', 1], [1, 999, '小吃货', 1], [6, 999, '小吃货', 1],
    [7, 0, '小吃货 Min', 2], [7, 39, '小吃货 Min', 2],
    [7, 40, '小吃货 Plus', 3], [7, 90, '小吃货 Pro', 3], [7, 160, '小吃货 Ultra', 3],
    [14, 0, '小吃货 Plus', 3], [21, 0, '小吃货 Pro', 3], [28, 0, '小吃货 Ultra', 3]
  ]
  for (const [days, exp, title, limit] of cases) {
    const row = { activityStreak: days, activityExp: exp }
    assert.equal(activityLevel(days, exp).title, title, `day=${days} exp=${exp}`)
    assert.equal(activityLevel(days, exp).dailyLimit, limit)
    assert.equal(pure.activityLevel(days, exp).title, title, 'CJS 与 TS 等级一致')
    const view = quotaView(row, DAY, 0)
    assert.equal(view.title, title); assert.equal(view.effective_limit, limit, '额度随等级变化')
    assert.equal(view.exp, exp)
    assert.deepEqual(pure.quotaView(row, DAY, 0), view, 'CJS 与 TS 视图一致')
  }
  assert.ok(quotaView({ activityStreak: 1, activityExp: 999 }, DAY, 0).exp_note.includes('前 7 天'))
  assert.ok(quotaView({ activityStreak: 7, activityExp: 40 }, DAY, 0).upgrade_hint.includes('成长值'))
  assert.equal(progressToNext(1, 999).nextTitle, '小吃货 Min', '前期仍以 7 天为唯一门槛')
})

test('成长值由行为累加：每日上限、同目标幂等、跨日重置且不改签到天数', async () => {
  const s = setup()
  s.seed('xsyj_profiles', [profile({ activityLastDay: DAY, activityStreak: 1 })])
  const first = await s.service.award('u1', 'publish', 'food-1')
  assert.equal(first.awarded, 3); assert.equal(first.exp, 3); assert.equal(first.exp_today, 3)
  const again = await s.service.award('u1', 'publish', 'food-1')
  assert.equal(again.awarded, 0, '同一目标不重复计分'); assert.equal(again.exp, 3)
  await s.service.award('u1', 'like', 'food-2')
  await s.service.award('u1', 'favorite', 'food-3')
  await s.service.award('u1', 'review', 'food-4')
  assert.equal(s.rows('xsyj_profiles')[0].activityExp, 7)
  assert.equal(s.rows('xsyj_profiles')[0].activityStreak, 1, '成长值不改签到天数')
  for (let i = 0; i < 10; i++) await s.service.award('u1', 'like', 'cap-' + i)
  const row = s.rows('xsyj_profiles')[0]
  assert.equal(row.activityExpToday, 12, '每日上限 12'); assert.equal(row.activityExp, 12)
  const capped = await s.service.award('u1', 'like', 'cap-99')
  assert.equal(capped.capped, true); assert.equal(capped.awarded, 0)
  s.setDay('2026-11-11')
  const next = await s.service.award('u1', 'like', 'newday-1')
  assert.equal(next.exp_today, 1, '跨日重置当日计数'); assert.equal(next.exp, 13)
})

test('点击等级标签弹出等级页，管理员显示最高身份，阶梯说明升级概念', () => {
  const pages = read('src/pages/CloudPages.tsx'), sheet = read('src/components/LevelPage.tsx'), badge = read('src/components/RoleBadge.tsx'), css = read('src/styles/app.css')
  assert.match(pages, /const\[levelOpen,setLevelOpen\]=useState\(false\)/)
  assert.match(pages, /className="level-toggle"[^>]*aria-haspopup="dialog"/)
  assert.ok(pages.includes('LevelPage level={isAdmin?null:level}'), '点击标签应弹出等级页')
  assert.ok(pages.includes('isSelf showLadder={!isAdmin}'), '我的页显示升级阶梯，管理员除外')
  assert.ok(!/\{level&&<section className="level-card"/.test(pages), '等级详情卡不应再内联展开')
  assert.match(sheet, /MESSAGES\.adminLevel/)
  assert.match(sheet, /LEVELS\.map/)
  assert.match(sheet, /className="level-ladder"/)
  assert.match(sheet, /title=\{level\.title\}/)
  assert.match(sheet, /className="level-stats"/)
  assert.ok(!sheet.includes('level-sheet-note'), '等级页不应再展示额外解释文字')
  assert.match(badge, /tier-admin/); assert.match(badge, /tier-'\+tier/); assert.match(badge, /className="crown"/)
  assert.match(badge, /is-clickable/); assert.match(badge, /quotaView\(/); assert.match(badge, /createPortal\(/)
  for (const tier of ['tier-0', 'tier-1', 'tier-2', 'tier-3', 'tier-4', 'tier-admin', 'level-gleam']) assert.ok(css.includes(tier), '缺少 ' + tier)
  assert.match(css, /\.level-toggle\{/); assert.match(css, /\.level-overlay\{/); assert.match(css, /\.level-ladder\{/); assert.match(css, /\.level-rung\{/); assert.match(css, /\.level-stats\{/)
  assert.ok(!css.includes('.level-card{'), '内联 level-card 样式应移除')
  assert.ok(!css.includes('.level-exp{'), '内联 level-exp 样式应移除')
  assert.ok(!css.includes('.level-sheet-note{'), '额外解释文字样式应移除')
})

test('他人徽章可查看升级状态：作者成长值与连续天数贯通服务端/演示/前端', () => {
  const service = read('server/classic/xsyj_web_v1/service.cjs'), demo = read('src/demo/repository.ts'), app = read('src/app/App.tsx'), pages = read('src/pages/CloudPages.tsx')
  assert.ok(service.includes('authorExp:author&&d.dailyActivity?d.dailyActivity.pure.expOf(author):0'), 'food DTO 缺少作者成长值')
  assert.ok(service.includes('authorStreak:author&&d.dailyActivity?d.dailyActivity.pure.readStreak(author):0'), 'food DTO 缺少作者连续天数')
  assert.ok(service.includes('exp:d.dailyActivity?d.dailyActivity.pure.expOf(r.profile):0'), '公开主页缺少成长值')
  assert.ok(demo.includes('authorExp:expOf(ar.row)'), '演示 food 缺少作者成长值')
  assert.ok(app.includes('exp={food.authorExp} streak={food.authorStreak}'), '食物作者徽章未传成长值')
  assert.ok(pages.includes('exp={data.profile.exp} streak={data.profile.streak}'), '公开主页徽章未传成长值')
})

test('评价、树洞、避雷徽章也贯通作者等级数据', () => {
  const service = read('server/classic/xsyj_web_v1/service.cjs'), forum = read('server/classic/xsyj_web_v1/forum.cjs'), foodNative = read('server/classic/xsyj_web_v1/native/food/index.js'), cautions = read('server/classic/xsyj_web_v1/native/cautions.js')
  const app = read('src/app/App.tsx'), compose = read('src/pages/CloudCompose.tsx'), forumPage = read('src/pages/ForumPages.tsx'), demoForum = read('src/demo/forum.ts')
  assert.ok(foodNative.includes('authorExp: Math.max(0, Math.floor(Number(profile.activityExp) || 0))'), 'authorBadges 缺少评价作者成长值')
  assert.ok(service.includes('authorExp:Number(row.authorExp)||0,authorStreak:Number(row.authorStreak)||0'), '评价 DTO 缺少作者等级')
  assert.ok(cautions.includes('exp: Math.max(0, Math.floor(Number(p.activityExp) || 0))'), '避雷 author 缺少成长值')
  assert.ok(service.includes('authorExp:Number(row.author?.exp)||0,authorStreak:Number(row.author?.streak)||0'), '避雷 DTO 缺少作者等级')
  assert.ok(forum.includes('exp:p?Math.max(0,Math.floor(Number(p.activityExp)||0)):0'), '树洞 author 缺少成长值')
  assert.ok(app.includes('exp={review.authorExp} streak={review.authorStreak}'), '评价徽章未传成长值')
  assert.ok(compose.includes('exp={post.authorExp} streak={post.authorStreak}'), '避雷徽章未传成长值')
  assert.ok(forumPage.includes('title={author.title} exp={author.exp} streak={author.streak}'), '树洞楼中徽章未传成长值')
  assert.ok(forumPage.includes('title={row.author.title} exp={row.author.exp} streak={row.author.streak}'), '树洞卡片徽章未传成长值')
  assert.ok(demoForum.includes('exp=state.daily?.exp?.[owner]?.total||0'), '演示树洞 author 缺少成长值')
})

test('管理员额度面板精简且额度输入为紧凑步进器', () => {
  const panel = read('src/components/AdminProfilePanel.tsx'), css = read('src/styles/app.css')
  for (const gone of ['额度调整原因', '失效日期', '历史操作记录', 'quotaReason', 'quotaExpiry']) assert.ok(!panel.includes(gone), '仍保留 ' + gone)
  assert.match(panel, /className="price-stepper quota-stepper"/)
  assert.match(panel, /aria-label="减少1条"/); assert.match(panel, /aria-label="增加1条"/)
  assert.match(panel, /保存自定义额度/); assert.match(panel, /取消覆写/)
  assert.match(css, /\.quota-stepper\{width:min\(100%,210px\)/)
  assert.match(css, /\.quota-stepper \.price-stepper-controls button\{width:48px;min-height:46px/)
  const service = read('server/classic/xsyj_web_v1/service.cjs')
  assert.match(service, /case 'saveFood':[\s\S]{0,500}award\(uid,'publish'/)
  for (const kind of ['favorite', 'like', 'review']) assert.ok(service.includes("award(uid,'" + kind + "'"), '缺少 ' + kind + ' 成长值入口')
})

test('演示态成长值随互动累加，前 7 天等级锁死，第 7 天经验可升 Plus', () => {
  const clock = () => new Date(DAY + 'T04:00:00Z')
  const locked = createDemoState('student')
  locked.daily = { checkIns: { [locked.actor]: { lastDay: DAY, streak: 6 } }, overrides: {}, events: [], exp: {} }
  const repo = createDemoRepository(locked, () => {}, { now: clock })
  assert.equal(repo.rpc<any>('context').profile.daily_level.title, '小吃货')
  repo.rpc('favorite', { id: 'demo-food-7', favorite: true })
  repo.rpc('likeFood', { id: 'demo-food-7', liked: true })
  const after = repo.rpc<any>('context').profile.daily_level
  assert.equal(after.exp, 2, '收藏 +1、点赞 +1')
  assert.equal(after.title, '小吃货', '经验不提前升级')
  const boosted = createDemoState('student')
  boosted.daily = { checkIns: { [boosted.actor]: { lastDay: DAY, streak: 7 } }, overrides: {}, events: [], exp: { [boosted.actor]: { total: 40, day: DAY, today: 0, keys: [] } } }
  const view = createDemoRepository(boosted, () => {}, { now: clock }).rpc<any>('context').profile.daily_level
  assert.equal(view.title, '小吃货 Plus'); assert.equal(view.effective_limit, 3)
})
