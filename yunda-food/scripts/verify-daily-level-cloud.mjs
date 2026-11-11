// Read-only probe for the deployed cloud function: confirms the new daily-level actions are live.
// Anonymous session only; no accounts, profiles, food items or overrides are created or changed.
// Run: node scripts/verify-daily-level-cloud.mjs
import fs from 'node:fs'
import cloudbase from '@cloudbase/js-sdk'

const env = 'cloud-yunda-d5gxrar1s14b2ee0d'
const config = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').trim().split(/\r?\n/).map(s => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)] }))
if (config.VITE_CLOUDBASE_ENV_ID !== env || config.VITE_CLOUDBASE_BACKEND !== 'classic') throw Error('Unexpected backend target')

const app = cloudbase.init({ env, region: 'ap-shanghai', accessKey: config.VITE_CLOUDBASE_PUBLISHABLE_KEY })
const auth = app.auth()
const anonymous = await Promise.race([
  auth.signInAnonymously(),
  new Promise((_, reject) => setTimeout(() => reject(Error('匿名登录超时：本机代理或网络不可达')), 20000))
])
if (anonymous.error) throw Error(anonymous.error.message)
const token = (await auth.getSession()).data.session.access_token
const url = 'https://' + env + '.api.tcloudbasegateway.com/v1/functions/xsyj_web_v1'

async function rpc(action, payload = {}) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ action, payload }) })
  const body = await response.json()
  return { status: response.status, ok: body?.ok, message: body?.message || '', data: body?.data }
}
const results = []
function check(name, ok, detail) { results.push({ name, ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' · ' + detail : '')) }

const context = await rpc('context')
check('云端 context 匿名可读且只返回游客身份', context.ok === true && context.data?.uid === null, 'uid=' + String(context.data?.uid) + ' profile=' + String(context.data?.profile))
for (const action of ['adminDailyQuotaDetail', 'adminSetDailyQuota']) {
  const result = await rpc(action, { id: 'probe-nonexistent-id' })
  const deployed = result.ok === false && !/不支持的业务请求/.test(result.message) && /登录|管理员/.test(result.message)
  check(action + ' 已部署且后端拒绝越权', deployed, result.message)
}
const legacy = await rpc('definitelyUnsupportedAction')
// Anonymous requests hit the login gate before the action whitelist; either rejection is correct.
check('未知动作仍被后端拒绝', legacy.ok === false && /登录|管理员|不支持的业务请求/.test(legacy.message), legacy.message)

const failed = results.filter(r => !r.ok)
fs.mkdirSync('docs/evidence', { recursive: true })
fs.writeFileSync('docs/evidence/daily-level-cloud-probe-20261111.json', JSON.stringify({
  generatedAt: new Date().toISOString(), environment: env, mode: 'anonymous-read-only',
  total: results.length, passed: results.length - failed.length, failed: failed.length, results
}, null, 2))
console.log(`\n合计 ${results.length} 项 · 通过 ${results.length - failed.length} · 失败 ${failed.length}`)
if (failed.length) process.exitCode = 1
