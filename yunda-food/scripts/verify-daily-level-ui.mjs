// Local, isolated verification for daily levels + responsive recommendation cards.
// Boots its own Vite dev server on 5199, uses demo (localStorage-only) data, never touches the cloud.
// Run: node scripts/verify-daily-level-ui.mjs
import {chromium} from 'playwright-core'
import {spawn} from 'node:child_process'
import {setTimeout as sleep} from 'node:timers/promises'
import {writeFileSync, mkdirSync} from 'node:fs'

const PORT = 5199, BASE = `http://127.0.0.1:${PORT}/`
const results = []
const runtimeErrors = []
function record(name, ok, detail) { results.push({ name, ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' · ' + detail : '')) }
async function check(name, fn) { try { record(name, true, await fn()) } catch (error) { record(name, false, (error && error.message) || String(error)) } }

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] })
let serverLog = ''
server.stdout.on('data', chunk => { serverLog += chunk })
server.stderr.on('data', chunk => { serverLog += chunk })
async function waitServer() {
  for (let i = 0; i < 80; i++) {
    try { const response = await fetch(BASE); if (response.ok) return } catch {}
    await sleep(400)
  }
  throw Error('Vite 未就绪: ' + serverLog.slice(-600))
}

const LONG_TITLE = '【超长标题验收】云南大学呈贡校区楠苑食堂二楼最里面那一家的招牌牛肉米线加卤蛋与酸汤猪脚双拼套餐'
const LONG_STORE = '【超长店名验收】云南大学呈贡校区楠苑食堂二楼风味窗口与大学城小吃街联合经营管理部'
const VIEWS = [['card', '.food-card'], ['list', '.food-row'], ['grid', '.food-tile']]
const VIEWPORTS = [{ width: 390, height: 844 }, { width: 360, height: 780 }, { width: 320, height: 720 }]

async function verifyView(page, layout, selector, label) {
  const index = VIEWS.findIndex(([id]) => id === layout)
  await page.locator('.layout-switch button').nth(index).click()
  await page.waitForSelector(selector, { timeout: 8000 })
  await page.waitForTimeout(120)
  await page.evaluate(({ sel, title, store }) => {
    document.querySelectorAll(sel).forEach((card, i) => {
      if (i === 0) {
        const strong = card.querySelector('strong'); if (strong) strong.textContent = title
        const line = card.querySelector('.store-name') || card.querySelector('.food-byline'); if (line) line.textContent = store
      }
      if (i === 1) {
        const image = card.querySelector('.food-media img'); if (image) image.remove()
        const rating = card.querySelector('.rating-badge'); if (rating) rating.remove()
      }
    })
  }, { sel: selector, title: LONG_TITLE, store: LONG_STORE })
  await page.waitForTimeout(100)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(120)
  const metrics = await page.evaluate(sel => {
    const cards = [...document.querySelectorAll(sel)]
    const prices = [...document.querySelectorAll(sel + ' .price')].map(node => {
      const style = getComputedStyle(node), rect = node.getBoundingClientRect()
      const unit = node.querySelector('.price-unit')
      return { height: rect.height, whiteSpace: style.whiteSpace, flexShrink: style.flexShrink, minWidth: parseFloat(style.minWidth) || 0, unitDelta: unit ? unit.getBoundingClientRect().top - rect.top : 0, text: node.textContent.trim() }
    })
    const rects = cards.map(node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom } })
    const first = cards[0]
    const titleRect = first?.querySelector('strong')?.getBoundingClientRect()
    const storeRect = first?.querySelector('.store-name')?.getBoundingClientRect() || first?.querySelector('.food-byline')?.getBoundingClientRect()
    const priceRect = first?.querySelector('.price')?.getBoundingClientRect()
    const fab = document.querySelector('.publish-fab')?.getBoundingClientRect()
    const tabbar = document.querySelector('.tabbar')?.getBoundingClientRect()
    return {
      count: cards.length, prices, rects,
      titleToStore: titleRect && storeRect ? storeRect.top - titleRect.bottom : null,
      titleToPrice: titleRect && priceRect ? priceRect.left - titleRect.right : null,
      titleHeight: titleRect ? titleRect.height : 0,
      fabTop: fab ? fab.top : null, tabbarTop: tabbar ? tabbar.top : null,
      badgeCount: document.querySelectorAll(sel + ' .level-badge').length,
      bodyText: document.body.innerText
    }
  }, selector)
  if (!metrics.count) throw Error('没有渲染出卡片')
  if (!metrics.prices.length) throw Error('没有价格单元')
  for (const price of metrics.prices) {
    if (price.whiteSpace !== 'nowrap') throw Error('价格 white-space 不是 nowrap: ' + price.whiteSpace)
    if (price.unitDelta > 12) throw Error('价格单位被挤到第二行，偏移 ' + price.unitDelta.toFixed(1) + 'px')
    if (price.height > 28) throw Error('价格被挤成两行，高度 ' + price.height.toFixed(1) + 'px · ' + price.text)
    if (price.minWidth < 40) throw Error('价格列缺少合理最小宽度')
  }
  for (let i = 0; i < metrics.rects.length; i++) for (let j = i + 1; j < metrics.rects.length; j++) {
    const a = metrics.rects[i], b = metrics.rects[j]
    if (a.x < b.right - 1 && a.right > b.x + 1 && a.y < b.bottom - 1 && a.bottom > b.y + 1) throw Error(`卡片 ${i}/${j} 重叠`)
  }
  if (layout === 'grid' && metrics.rects.length >= 2) {
    const [a, b] = metrics.rects
    if (Math.abs(a.y - b.y) > 1) throw Error('双列左右卡片顶部未对齐')
    if (Math.abs(a.h - b.h) > 2) throw Error('双列卡片高度不一致: ' + a.h.toFixed(1) + '/' + b.h.toFixed(1))
  }
  if (layout === 'list' && metrics.titleToStore != null && (metrics.titleToStore < 0 || metrics.titleToStore > 8)) throw Error('标题与店名间距不在 4–8px: ' + metrics.titleToStore.toFixed(1))
  if (layout !== 'grid' && metrics.titleToPrice != null && metrics.titleToPrice < -1) throw Error('标题与价格重叠')
  if (metrics.titleHeight > 48) throw Error('标题超过两行，高度 ' + metrics.titleHeight.toFixed(1))
  if (metrics.fabTop != null && metrics.rects.at(-1).bottom > metrics.fabTop + 1) throw Error('最后一张卡片被发布推荐按钮遮挡')
  if (metrics.tabbarTop != null && metrics.rects.at(-1).bottom > metrics.tabbarTop + 1 && metrics.rects.at(-1).bottom < metrics.tabbarTop + 80) throw Error('最后一张卡片被底部导航遮挡')
  if (/Utral/i.test(metrics.bodyText)) throw Error('页面出现 Utral 拼写')
  return `${metrics.count} 卡 · 价格 ${metrics.prices[0].text.replace(/\s+/g, '')} 单行 ${metrics.prices[0].height.toFixed(0)}px · 称号标签 ${metrics.badgeCount}`
}

let browser
try {
  await waitServer()
  browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-proxy-server', '--no-first-run'] })
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport, locale: 'zh-CN', deviceScaleFactor: 1 })
    const page = await context.newPage()
    page.on('pageerror', error => runtimeErrors.push(`${viewport.width}px: ${error.message}`))
    await page.goto(BASE + '?demo=student#/', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.layout-switch button', { timeout: 15000 })
    await page.waitForSelector('.food-card', { timeout: 15000 })
    for (const [layout, selector] of VIEWS) await check(`${viewport.width}px · ${layout} 视图长标题/长店名/无图/无评分`, () => verifyView(page, layout, selector, viewport.width))
    await context.close()
  }
  const ui = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', deviceScaleFactor: 1 })
  const page = await ui.newPage()
  page.on('pageerror', error => runtimeErrors.push('UI: ' + error.message))
  await page.goto(BASE + '?demo=student#/me', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.level-toggle', { timeout: 15000 })
  await check('个人页默认不弹等级页', async () => {
    if (await page.locator('.level-sheet').count()) throw Error('等级页不应常驻')
    return '默认无等级页'
  })
  await check('点击称号标签弹出等级页，含完整阶梯与成长值', async () => {
    const toggle = page.locator('.level-toggle')
    const badge = await toggle.locator('.level-badge').getAttribute('class')
    if (!/tier-\d/.test(badge || '')) throw Error('称号标签没有分级样式: ' + badge)
    await toggle.click()
    await page.waitForSelector('.level-sheet', { timeout: 8000 })
    const text = await page.locator('.level-sheet').innerText()
    for (const part of ['小吃货', '连续活跃', '成长值', '每日', '小吃货 Ultra']) if (!text.includes(part)) throw Error('等级页缺少 ' + part)
    const rungs = await page.locator('.level-rung').count()
    if (rungs !== 5) throw Error('应显示 5 个等级阶梯，实际 ' + rungs)
    if (await page.locator('.level-rung.is-current').count() !== 1) throw Error('应高亮 1 个当前等级')
    const bar = await page.locator('.level-track').getAttribute('aria-valuenow')
    if (Number(bar) < 0 || Number(bar) > 100) throw Error('进度值无效')
    await page.locator('.level-sheet .chip').click()
    if (await page.locator('.level-sheet').count()) throw Error('关闭按钮未关闭等级页')
    return `样式 ${badge} · 阶梯 ${rungs} 级 · 签到 ${bar}%`
  })
  await check('管理员最高身份不显示升级经验与进度', async () => {
    await page.goto(BASE + '?demo=admin#/me', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.level-toggle', { timeout: 15000 })
    const badge = await page.locator('.level-toggle .level-badge').getAttribute('class')
    if (!/tier-admin/.test(badge || '')) throw Error('管理员未用最尊贵样式: ' + badge)
    if (!(await page.locator('.level-toggle .crown').count())) throw Error('管理员徽章缺少皇冠')
    await page.locator('.level-toggle').click()
    await page.waitForSelector('.level-sheet', { timeout: 8000 })
    const text = await page.locator('.level-sheet').innerText()
    if (!text.includes('吃货大王')) throw Error('缺少最高身份')
    if (await page.locator('.level-summary .level-track').count()) throw Error('管理员不应显示进度条')
    return '吃货大王 · 无进度条 · 皇冠徽章'
  })
  await page.goto(BASE + '?demo=student#/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.food-card .level-badge.is-clickable', { timeout: 15000 })
  await check('他人徽章可查看等级状态', async () => {
    await page.locator('.food-card .level-badge.is-clickable').first().click()
    await page.waitForSelector('.level-sheet', { timeout: 8000 })
    const text = await page.locator('.level-sheet').innerText()
    if (!text.includes('Ta 的等级')) throw Error('应显示 Ta 的等级: ' + text)
    for (const part of ['成长值', '连续活跃', '每日额度']) if (!text.includes(part)) throw Error('缺少统计项 ' + part)
    if (await page.locator('.level-ladder').count()) throw Error('他人弹窗不应显示完整阶梯')
    await page.locator('.level-sheet .chip').click()
    return 'Ta 的等级 · 三项统计'
  })
  await page.goto(BASE + '?demo=student#/publish', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.quota-hint', { timeout: 15000 })
  await check('发布页展示剩余额度与称号', async () => {
    const text = await page.locator('.quota-hint').innerText()
    if (!/今日还可发布/.test(text)) throw Error('未展示剩余额度: ' + text)
    return text
  })
  await check('管理员额度面板精简且步进器按钮够大', async () => {
    await page.goto(BASE + '?demo=admin#/admin', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.admin-tabs button', { timeout: 15000 })
    await page.locator('.admin-tabs button').filter({ hasText: /^用户$/ }).click()
    await page.waitForSelector('.admin-people .admin-person', { timeout: 15000 })
    await page.locator('.admin-people .admin-person').first().click()
    await page.waitForSelector('.quota-admin', { timeout: 15000 })
    const text = await page.locator('.quota-admin').innerText()
    for (const part of ['每日发布额度', '当前称号', '连续活跃天数', '等级默认额度', '今日已发布 / 剩余']) if (!text.includes(part)) throw Error('管理区缺少 ' + part)
    for (const gone of ['额度调整原因', '失效日期', '历史操作记录']) if (text.includes(gone)) throw Error('仍保留 ' + gone)
    const inputs = await page.locator('.quota-admin input').count()
    if (inputs !== 1) throw Error('应只保留 1 个额度输入框，实际 ' + inputs)
    const size = await page.locator('.quota-stepper .price-stepper-controls button').first().boundingBox()
    if (!size || size.width < 44 || size.height < 44) throw Error('加减按钮过小: ' + JSON.stringify(size))
    const chips = await page.locator('.quota-admin .chip').allInnerTexts()
    if (!chips.some(b => b.includes('取消覆写'))) throw Error('缺少取消覆写')
    return `1 个紧凑输入 · 按钮 ${Math.round(size.width)}×${Math.round(size.height)} · ${chips.join('/')}`
  })
  await check('隔离演示模式没有运行时错误', async () => {
    if (runtimeErrors.length) throw Error(runtimeErrors.slice(0, 3).join(' | '))
    return '0 个 pageerror'
  })
  await ui.close()
} finally {
  if (browser) await browser.close().catch(() => {})
  server.kill('SIGTERM')
}
const failed = results.filter(r => !r.ok)
mkdirSync('docs/evidence', { recursive: true })
writeFileSync('docs/evidence/daily-level-ui-local-20261111.json', JSON.stringify({
  generatedAt: new Date().toISOString(), scope: 'isolated-demo-local', viewports: VIEWPORTS.map(v => v.width), views: VIEWS.map(([id]) => id),
  total: results.length, passed: results.length - failed.length, failed: failed.length, runtimeErrors, results
}, null, 2))
console.log(`\n合计 ${results.length} 项 · 通过 ${results.length - failed.length} · 失败 ${failed.length}`)
if (failed.length) process.exitCode = 1
