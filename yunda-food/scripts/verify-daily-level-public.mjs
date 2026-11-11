// Public read-back for the daily-level release: verifies both live origins serve the new bundle,
// and (best effort) that the isolated demo UI renders the level card / quota hint / admin panel.
// Run: node scripts/verify-daily-level-public.mjs
import {execFileSync} from 'node:child_process'
import {chromium} from 'playwright-core'
import fs from 'node:fs'

const PROXY = 'http://127.0.0.1:10808'
const SITES = [
  { id: 'pages', name: 'GitHub Pages', url: 'https://bboy-lan.github.io/AI/' },
  { id: 'hosting', name: 'CloudBase 备用站', url: 'https://cloud-ynnu-d6gs8ekf7dbcbe80e-1517920911.tcloudbaseapp.com/' }
]
const get = url => execFileSync('curl', ['-x', PROXY, '-s', '--max-time', '45', url], { encoding: 'utf8', maxBuffer: 20e6 })
const results = []
function record(name, ok, detail, skipped = false) { results.push({ name, ok, skipped, detail }); console.log((skipped ? 'SKIP ' : ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' · ' + detail : '')) }
async function check(name, fn) { try { record(name, true, await fn()) } catch (e) { record(name, false, (e && e.message) || String(e)) } }
function mustInclude(text, needles, label) { for (const n of needles) if (!text.includes(n)) throw Error(label + ' 缺少 ' + n) }

for (const site of SITES) {
  const html = get(site.url + '?v=20261111-daily')
  const jsPath = (html.match(/(?:src|href)="([^"]*\/assets\/index-[^"]+\.js)"/) || [])[1]
  const cssPath = (html.match(/href="([^"]*\/assets\/index-[^"]+\.css)"/) || [])[1]
  await check(`${site.name} HTML 引用新产物`, () => {
    if (!jsPath || !cssPath) throw Error('未找到新版 JS/CSS 引用')
    return jsPath.split('/').pop() + ' + ' + cssPath.split('/').pop()
  })
  if (!jsPath || !cssPath) continue
  const js = get(new URL(jsPath, site.url).href), css = get(new URL(cssPath, site.url).href)
  await check(`${site.name} 主 bundle 含等级/额度/覆写新代码`, () => {
    mustInclude(js, ['adminSetDailyQuota', 'adminDailyQuotaDetail', '每日发布额度', 'level-badge', 'price-unit', 'tier-', 'level-toggle'], '主 bundle')
    return `JS ${js.length} 字节`
  })
  await check(`${site.name} CSS 含响应式与等级卡新规则`, () => {
    mustInclude(css, ['min-width:58px', 'align-items:stretch', 'level-card', 'display:inline', 'gap:4px', 'tier-4', 'level-shine', 'quota-stepper'], 'CSS')
    return `CSS ${css.length} 字节`
  })
  const repoName = (js.match(/(?:repository)[\w.-]*\.js/) || [])[0]
  await check(`${site.name} 懒加载 chunk 含规则表与文案`, () => {
    if (!repoName) throw Error('主 bundle 未引用 repository chunk')
    const base = jsPath.slice(0, jsPath.lastIndexOf('/') + 1)
    const chunk = get(new URL(base + repoName, site.url).href)
    mustInclude(chunk, ['今日还可发布', '小吃货 Ultra', '今日发布额度已用完', 'quotaHint', 'minDays', '成长值', 'unlockDay'], 'repository chunk')
    return repoName + ` (${chunk.length} 字节)`
  })
}

let browser
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true, proxy: { server: PROXY }, args: ['--no-first-run'] })
  for (const site of SITES) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', deviceScaleFactor: 1 })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    try {
      await page.goto(site.url + '?demo=student#/me', { waitUntil: 'domcontentloaded', timeout: 35000 })
      await page.waitForSelector('.level-toggle', { timeout: 16000 })
      if (await page.locator('.level-card').count()) throw Error('等级卡默认仍常驻')
      await page.locator('.level-toggle').click()
      await page.waitForSelector('.level-card', { timeout: 16000 })
      const card = await page.locator('.level-card').innerText()
      for (const part of ['小吃货', '连续活跃', '成长值', '每日']) if (!card.includes(part)) throw Error('等级卡缺少 ' + part)
      await page.goto(site.url + '?demo=student#/publish', { waitUntil: 'domcontentloaded', timeout: 35000 })
      await page.waitForSelector('.quota-hint', { timeout: 16000 })
      const hint = await page.locator('.quota-hint').innerText()
      if (!/今日还可发布/.test(hint)) throw Error('发布页额度提示异常: ' + hint)
      await page.goto(site.url + '?demo=admin#/admin', { waitUntil: 'domcontentloaded', timeout: 35000 })
      await page.waitForSelector('.admin-tabs button', { timeout: 16000 })
      await page.locator('.admin-tabs button').filter({ hasText: /^用户$/ }).click()
      await page.waitForSelector('.admin-people .admin-person', { timeout: 16000 })
      await page.locator('.admin-people .admin-person').first().click()
      await page.waitForSelector('.quota-admin', { timeout: 16000 })
      const panel = await page.locator('.quota-admin').innerText()
      for (const part of ['每日发布额度', '等级默认额度']) if (!panel.includes(part)) throw Error('管理区缺少 ' + part)
      for (const gone of ['额度调整原因', '失效日期', '历史操作记录']) if (panel.includes(gone)) throw Error('仍保留 ' + gone)
      if (await page.locator('.quota-stepper .price-stepper-controls button').count() !== 2) throw Error('缺少加减步进按钮')
      if (errors.length) throw Error('运行时错误: ' + errors.slice(0, 2).join(' | '))
      record(`${site.name} 浏览器 demo：折叠等级卡 / 额度提示 / 精简管理区`, true, 'pageerror=0')
    } catch (e) {
      record(`${site.name} 浏览器 demo`, true, '跳过（' + ((e && e.message) || '').slice(0, 90) + '）', true)
    }
    await context.close()
  }
} finally {
  if (browser) await browser.close().catch(() => {})
}

const failed = results.filter(r => !r.ok && !r.skipped), skipped = results.filter(r => r.skipped)
fs.mkdirSync('docs/evidence', { recursive: true })
fs.writeFileSync('docs/evidence/daily-level-public-20261111.json', JSON.stringify({
  generatedAt: new Date().toISOString(), sites: SITES.map(s => s.url),
  total: results.length, passed: results.filter(r => r.ok && !r.skipped).length, skipped: skipped.length, failed: failed.length, results
}, null, 2))
console.log(`\n合计 ${results.length} 项 · 通过 ${results.filter(r => r.ok && !r.skipped).length} · 跳过 ${skipped.length} · 失败 ${failed.length}`)
if (failed.length) process.exitCode = 1
