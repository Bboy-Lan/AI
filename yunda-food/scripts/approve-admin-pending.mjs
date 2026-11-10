// 一次性把小食云记里「管理员名下仍在待审」的内容改为已审核。
// 管理员自己发布的内容（推荐、经历、话题、楼层、评价）按产品规则免审；
// 本脚本只处理 reviewTag=pending（或无 reviewTag 但 status=pending）且作者是管理员的记录，
// 不碰其他任何行。默认只统计，加 --apply 才写库。
import {execFileSync} from 'node:child_process'
import {createRequire} from 'node:module'
import fs from 'node:fs'
const require = createRequire(import.meta.url), cli = require.resolve('@cloudbase/cli/bin/tcb'), env = 'cloud-yunda-d5gxrar1s14b2ee0d'
const config = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').trim().split(/\r?\n/).map(s => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)] }))
if (config.VITE_CLOUDBASE_ENV_ID !== env || config.VITE_CLOUDBASE_BACKEND !== 'classic') throw Error('目标环境不是已批准的正式环境')
const call = args => { const r = JSON.parse(execFileSync(process.execPath, [cli, ...args, '-e', env, '--json'], { encoding: 'utf8', maxBuffer: 10e6 })); if (r.error) throw Error(r.error.message); return r.data ?? r }
const mongo = (name, command, type = 'QUERY') => call(['db', 'nosql', 'execute', '--command', JSON.stringify([{ TableName: name, CommandType: type, Command: JSON.stringify(command) }])]).results[0]
const apply = process.argv.includes('--apply')
const target = call(['env', 'detail'])
if (target.EnvId !== env || target.PostgreSQL?.length || target.PackageId !== 'baas_personal') throw Error('目标不是选定的传统文档库环境')

const admins = mongo('xsyj_admins', { find: 'xsyj_admins', filter: { enabled: true }, limit: 100 })
const uids = admins.map(a => a.openId).filter(Boolean)
const TABLES = [
 ['xsyj_food_items', 'published', '推荐', 'name'],
 ['xsyj_caution_posts', 'published', '经历', 'name'],
 ['xsyj_forum_topics', 'public', '话题', 'title'],
 ['xsyj_forum_replies', 'public', '楼层', 'body'],
 ['xsyj_reviews', 'published', '评价', 'text'],
]
const stamp = new Date().toISOString()
const report = { checkedAt: stamp, environment: env, mode: apply ? 'apply' : 'dry-run', administrators: uids.length, collections: {}, changed: 0 }

if (!uids.length) { console.log('没有启用的管理员，无需处理。'); process.exit(0) }
for (const [table, publicStatus, label, textField] of TABLES) {
 const filter = { ownerOpenId: { $in: uids }, $or: [{ reviewTag: 'pending' }, { reviewTag: { $exists: false }, status: 'pending' }] }
 const rows = mongo(table, { find: table, filter, limit: 200 })
 const entry = { label, table, pending: rows.length, approved: 0, samples: rows.slice(0, 3).map(r => String(r[textField] || r._id).slice(0, 40)) }
 if (apply && rows.length) {
  const updates = rows.map(r => ({ q: { _id: r._id }, u: { $set: { reviewTag: 'approved', status: publicStatus, reviewVersion: (r.reviewVersion || 0) + 1, reviewedAt: stamp, adminSelfApprovedAt: stamp } } }))
  for (let i = 0; i < updates.length; i += 50) mongo(table, { update: table, updates: updates.slice(i, i + 50) }, 'UPDATE')
  entry.approved = updates.length
  report.changed += updates.length
  for (const r of rows) mongo('xsyj_events', { insert: 'xsyj_events', documents: [{ type: 'admin_self_approve', targetKind: label, targetId: r._id, operatorOpenId: 'system', reason: '管理员本人发布的内容免审', createdAt: stamp }] }, 'INSERT')
 }
 report.collections[table] = entry
 console.log(`${label}（${table}）：待审 ${entry.pending}${apply ? ' → 已通过 ' + entry.approved : ''}${entry.samples.length ? ' · ' + entry.samples.join(' / ') : ''}`)
}
fs.mkdirSync('docs/evidence', { recursive: true })
fs.writeFileSync('docs/evidence/ux-admin-self-approve-20261110.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify({ mode: report.mode, administrators: uids.length, changed: report.changed }))
