import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createDemoState} from '../src/demo/fixtures'
import {createDemoRepository} from '../src/demo/repository'

// 第十轮：管理员私信 + 互动消息点开即已读。
const adminRepo = () => createDemoRepository(createDemoState('admin'))
const studentRepo = () => createDemoRepository(createDemoState('student'))
const pages = () => readFileSync('src/pages/GovernancePages.tsx', 'utf8')
const panel = () => readFileSync('src/components/AdminProfilePanel.tsx', 'utf8')
const feedback = () => readFileSync('src/components/FeedbackPanel.tsx', 'utf8')
const direct = () => readFileSync('src/components/DirectMessages.tsx', 'utf8')
const css = () => readFileSync('src/styles/app.css', 'utf8')
const service = () => readFileSync('server/classic/xsyj_web_v1/service.cjs', 'utf8')
const inbox = () => readFileSync('server/classic/xsyj_web_v1/native/food/inbox.js', 'utf8')

test('管理员能列出私信对话，未读按用户回复计数', () => {
 const repo = adminRepo()
 const threads = repo.rpc<{ profileId: string, name: string, unread: number }[]>('adminDirectThreads')
 const other = threads.find(row => row.profileId === 'demo-profile-demo-other')
 assert.ok(other, '缺少与阿岚同学的对话')
 assert.equal(other.unread, 1, '阿岚同学的回复应计 1 条未读')
 assert.ok(threads.every(row => row.profileId), '对话必须带 profileId 才能打开')
})

test('管理员发私信写进对应用户的对话，用户侧变成未读', () => {
 const repo = adminRepo()
 const before = repo.rpc<{ unreadCount: number }>('notificationSummary').unreadCount
 repo.rpc('sendDirectMessage', { profileId: 'demo-profile-demo-student', body: '请补充窗口位置。', clientRequestId: 'req-dm-0001' })
 const thread = repo.rpc<{ messages: { body: string, fromAdmin: boolean }[] }>('adminDirectThread', { profileId: 'demo-profile-demo-student' })
 const last = thread.messages.at(-1)!
 assert.equal(last.body, '请补充窗口位置。')
 assert.equal(last.fromAdmin, true)
 // 管理员发出去的消息自己已读，不增加自己的未读。
 assert.equal(repo.rpc<{ unreadCount: number }>('notificationSummary').unreadCount, before)
})

test('同一提交编号重复发送不会写出两条私信', () => {
 const repo = adminRepo()
 const payload = { profileId: 'demo-profile-demo-student', body: '重复提交测试。', clientRequestId: 'req-dm-0002' }
 repo.rpc('sendDirectMessage', payload)
 repo.rpc('sendDirectMessage', payload)
 const thread = repo.rpc<{ messages: unknown[] }>('adminDirectThread', { profileId: 'demo-profile-demo-student' })
 assert.equal(thread.messages.length, 2, '原有 1 条 + 新增 1 条')
})

test('用户不能主动发起私信，只能回复自己的那条对话', () => {
 const repo = studentRepo()
 assert.throws(() => repo.rpc('sendDirectMessage', { profileId: 'demo-profile-demo-admin', body: '你好' }), /无管理员权限/)
 repo.rpc('replyDirectMessage', { body: '收到，已经补充好了。', clientRequestId: 'req-dm-0003' })
 const mine = repo.rpc<{ body: string, fromAdmin: boolean, read: boolean }[]>('myDirectMessages')
 const last = mine.at(-1)!
 assert.equal(last.fromAdmin, false)
 assert.equal(last.read, true, '自己刚发的内容不该给自己算未读')
})

test('用户侧私信未读进入消息汇总，读过就清零', () => {
 const repo = studentRepo()
 const before = repo.rpc<{ unreadCount: number }>('notificationSummary')
 const mine = repo.rpc<{ read: boolean }[]>('myDirectMessages')
 assert.ok(mine.some(row => !row.read), '演示数据里应有 1 条管理员未读私信')
 repo.rpc('readDirectMessages', {})
 const after = repo.rpc<{ unreadCount: number }>('notificationSummary')
 assert.equal(before.unreadCount - after.unreadCount, 1)
 assert.ok(repo.rpc<{ read: boolean }[]>('myDirectMessages').every(row => row.read))
})

test('管理员打开对话后对应用户的未读归零', () => {
 const repo = adminRepo()
 repo.rpc('adminDirectThread', { profileId: 'demo-profile-demo-other' })
 repo.rpc('readDirectMessages', { profileId: 'demo-profile-demo-other' })
 const threads = repo.rpc<{ profileId: string, unread: number }[]>('adminDirectThreads')
 assert.equal(threads.find(row => row.profileId === 'demo-profile-demo-other')!.unread, 0)
})

test('私信内容太短会被拒绝', () => {
 const repo = adminRepo()
 assert.throws(() => repo.rpc('sendDirectMessage', { profileId: 'demo-profile-demo-other', body: '好' }), /至少2个字/)
 assert.throws(() => repo.rpc('sendDirectMessage', { profileId: 'demo-profile-demo-other', body: '　 ' }), /至少2个字/)
})

test('服务端私信接口齐全，openid 不出服务端', () => {
 const code = inbox()
 for (const name of ['myDirectMessages', 'adminDirectThreads', 'adminDirectThread', 'sendDirectMessage', 'replyDirectMessage', 'readDirectMessages', 'directSummary']) assert.match(code, new RegExp('function ' + name + '\\('), `缺少 ${name}`)
 assert.match(code, /async function profileRow\(profileId\)/)
 assert.ok(!/return \{[^}]*userUid:/.test(code), '对话 DTO 不应把 openid 返回给客户端')
 const route = service()
 for (const name of ['myDirectMessages', 'adminDirectThreads', 'adminDirectThread', 'sendDirectMessage', 'replyDirectMessage', 'readDirectMessages']) assert.match(route, new RegExp("case '" + name + "'"), `服务层缺少 ${name} 分支`)
 assert.match(route, /f\('directSummary'\)[\s\S]{0,400}\(direct\.unreadCount\|\|0\)/)
 // 封禁用户仍然能看管理员发来的说明。
 assert.match(route, /'myDirectMessages','replyDirectMessage','readDirectMessages'/)
})

test('消息页新增私信分组，管理员从用户资料发起', () => {
 const code = pages()
 assert.match(code, /\['direct','私信'\]/)
 assert.match(code, /if\(mode==='direct'\)return[\s\S]{0,200}<DirectMessages profileId=/)
 assert.match(panel(), /messages\?mode=direct&user='\+encodeURIComponent\(data\.profile\.uid\)/)
 assert.match(panel(), />发私信</)
 // 管理员发起、用户只读回复：组件里不能出现用户侧的“新对话”入口。
 assert.match(direct(), /只有管理员可以主动发起私信/)
 assert.match(direct(), /isAdmin&&!messages\.length\?'sendDirectMessage':'replyDirectMessage'/)
 // 气泡署名按当前视角算，管理员看自己的消息不能标成“管理员”。
 assert.match(direct(), /\(mine\(m\)\?'我':isAdmin\?'用户':'管理员'\)/)
})

test('点开消息即已读，未读状态高对比显示', () => {
 const code = pages()
 assert.match(code, /const select=\(row:any\)=>\{setSelectedId\(row\.id\);if\(isUnread\(row\)\)void mutate\('read',row\.id\)/)
 assert.match(code, /const openTarget=\(row:any\)=>\{if\(isUnread\(row\)\)void mutate\('read',row\.id\);go\(row\.path\?/)
 assert.match(code, /if\(!threadOpen&&isUnread\(selected\)\)void mutate\('read',selected\.id\)/)
 assert.match(feedback(), /if\(p\.open!==row\.id&&unread\)p\.onAction\('read',row\.id\)/)
 assert.match(code, /'msg-tag'\+\(unread\?' is-unread':''\)/)
 const rules = css()
 assert.match(rules, /\.msg-tag\{[^}]*border-radius:5px/)
 assert.match(rules, /\.msg-tag\.is-unread\{[^}]*color:#b5402c/)
})
