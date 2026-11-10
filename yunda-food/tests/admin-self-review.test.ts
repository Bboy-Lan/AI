import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import crypto from 'node:crypto'
import {memoryDb} from './support/memory-db'
const require = createRequire(import.meta.url)
const policy = require('../server/classic/xsyj_web_v1/review-policy.cjs')
const factory = require('../server/classic/xsyj_web_v1/moderation.cjs')

// 管理员自己发的内容不需要别人审，也不该在提醒里出现「你的内容待审核 / 已审核」。
function setup(){
 const m = memoryDb()
 const d: any = {db: m.db, fail: (s: string) => { throw Error(s) }, hash: (...v: any[]) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 32), now: () => new Date('2026-11-10T04:00:00Z'), requireAdmin: async (uid: string) => { if (uid !== 'admin') throw Error('无管理员权限') }, profileFor: async (uid: string) => ({_id: 'profile-' + uid, foodieId: '同学' + uid})}
 const service = factory(d)
 m.seed('xsyj_forum_topics', [
  {_id: 'own-topic', ownerOpenId: 'admin', title: '管理员自己的话题', body: '一段正常的正文。', category: '校园生活', status: 'public', reviewTag: 'pending', reviewVersion: 0, version: 1, images: [], replyCount: 0},
  {_id: 'other-topic', ownerOpenId: 'owner', title: '同学的话题', body: '一段正常的正文。', category: '校园生活', status: 'public', reviewTag: 'pending', reviewVersion: 0, version: 1, images: [], replyCount: 0},
 ])
 const call = (action: string, payload: any = {}, uid = 'admin') => service.handler(uid, action, payload)
 return {call, ...m}
}

test('审核策略：管理员提交即通过，普通用户仍需审核，已下架内容保持隐藏', () => {
 assert.equal(policy.resubmit(null, true).reviewTag, 'approved')
 assert.equal(policy.resubmit({status: 'published'}, true).reviewTag, 'approved')
 assert.equal(policy.resubmit({status: 'public'}, true).reviewTag, 'approved')
 assert.equal(policy.resubmit({status: 'pending'}, true).reviewTag, 'approved')
 assert.equal(policy.resubmit(null, false).reviewTag, 'pending')
 assert.equal(policy.resubmit({status: 'published'}, false).reviewTag, 'pending')
 // 管理员改自己被打回的内容也不能悄悄恢复隐藏状态。
 const hidden = policy.resubmit({status: 'hidden'}, true)
 assert.equal(hidden.status, 'hidden')
 assert.equal(hidden.reviewTag, 'pending')
})

test('五类内容提交都必须显式声明作者是否为管理员', () => {
 const files = ['server/classic/xsyj_web_v1/native/food/index.js', 'server/classic/xsyj_web_v1/native/cautions.js', 'server/classic/xsyj_web_v1/forum.cjs']
 const calls: string[] = []
 for (const file of files) {
  const source = readFileSync(file, 'utf8')
  for (const matched of source.matchAll(/reviewPolicy\.resubmit\(|\.\.\.require\((['"])\.\/review-policy\.cjs\1\)\.resubmit\(/g)) {
   const tail = source.slice(matched.index! + matched[0].length, matched.index! + matched[0].length + 60)
   calls.push(file + ' :: ' + tail.split('\n')[0].slice(0, 48))
   // 少传第二个参数就等于把管理员的内容扔回待审队列，这里直接拦住。
   assert.match(tail, /^[^)]*,/, '缺少管理员标志：' + file + ' :: ' + tail.slice(0, 40))
  }
 }
 assert.ok(calls.length >= 5, '五类内容都要覆盖到，实际只有 ' + calls.length + ' 处')
 // 评价这一处曾经漏传，单独钉住。
 const food = readFileSync(files[0], 'utf8')
 assert.match(food, /const verifiedAdmin=Boolean\(await adminFor\(id\)\)[\s\S]{0,700}resubmit\(current,verifiedAdmin\)/, '评价提交没有按管理员免审处理')
})

test('管理员审自己的内容不产生任何待审提醒', async () => {
 const {call, rows} = setup()
 const own = await call('adminReviewDetail', {kind: 'topic', id: 'own-topic'})
 await call('adminReviewApply', {kind: 'topic', id: own.id, token: own.reviewToken, action: 'approved', reason: '本人内容直接通过', clientRequestId: 'self-review-00001'})
 assert.equal(rows('xsyj_review_notifications').length, 0, '自己操作自己的内容不该给自己发通知')
 assert.equal((await call('adminReviewDetail', {kind: 'topic', id: 'own-topic'})).reviewTag, 'approved')
})

test('审核别人的内容仍照常通知作者本人', async () => {
 const {call, rows} = setup()
 const other = await call('adminReviewDetail', {kind: 'topic', id: 'other-topic'})
 await call('adminReviewApply', {kind: 'topic', id: other.id, token: other.reviewToken, action: 'changes', reason: '请补充具体情况', clientRequestId: 'other-review-0001'})
 const notices = rows('xsyj_review_notifications')
 assert.equal(notices.length, 1)
 assert.equal(notices[0].ownerOpenId, 'owner')
 assert.equal(notices[0].actor, 'admin')
})
