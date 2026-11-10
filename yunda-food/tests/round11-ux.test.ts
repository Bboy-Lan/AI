import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {normalize} from '../src/domain/discovery'
import {cautionRequiredError} from '../src/domain/form-requirements'
import {createDemoState} from '../src/demo/fixtures'
import {createDemoRepository} from '../src/demo/repository'
import type {Food} from '../src/services/local-repository'

const read = (file: string) => readFileSync(file, 'utf8')
const base = {id:'test-food',placeText:'',name:'豆米火锅',category:'正餐',locationType:'inside' as const,school:'云南大学',campus:'云南大学东陆校区',venue:'楠苑二楼 3 号窗口',price:18,priceBasis:'portion' as const,taste:{spicy:2},author:'',hometown:'',tags:[],images:[],status:'public' as const} as Food

test('地址改成两段式：只保留最具体的一段，同一处地点不重复出现', () => {
  assert.equal(normalize(base).placeText, '云南大学东陆校区 · 楠苑二楼 3 号窗口')
  assert.equal(normalize({...base, locationType:'outside', school:'', campus:'', region:'昆明市呈贡区', venue:'示例街区 3 号摊位'}).placeText, '昆明市呈贡区 · 示例街区 3 号摊位')
  assert.equal(normalize({...base, campus:'', venue:'云南大学'}).placeText, '云南大学')
  // 老记录没有分段字段时仍回落到原来的 placeText，不会显示“地点未标注”。
  assert.equal(normalize({...base, school:'', campus:'', venue:'', placeText:'老记录 · 楠苑'}).placeText, '老记录 · 楠苑')
})

test('发布页只保留必要地址字段，图片与推荐理由必填', () => {
  const source = read('src/pages/CloudCompose.tsx')
  for (const text of ['美食名称', '具体地址', '实拍组图 · 1～3张', '想推荐它的理由', "draft.locationType==='inside'?'食堂 / 楼 / 窗口':'店铺 / 摊位'"]) assert.ok(source.includes(text), text)
  for (const gone of ['消费日期', '地点细节补充', '街道 / 摊位', '<label>地点']) assert.ok(!source.includes(gone), gone)
})

test('店名排在美食名称下方并缩进，长标题不会把价格挤走', () => {
  const css = read('src/styles/app.css')
  const rule = css.match(/\.store-name\{[^}]*\}/)?.[0] || ''
  assert.ok(rule.includes('padding-left:8px'), '店名左侧缩进')
  assert.ok(rule.includes('border-left:2px solid'), '店名层级线')
  assert.ok(/\.food-title-row strong\{[^}]*line-clamp:2/.test(css), '标题最多两行')
  assert.ok(/\.food-title-row \.price\{flex:0 0 auto\}/.test(css), '价格不被压缩')
})

test('治理入口文案精简，版面为两栏工作台并兼顾手机', () => {
  const pages = read('src/pages/CloudPages.tsx'), admin = read('src/pages/GovernancePages.tsx'), css = read('src/styles/app.css')
  assert.ok(pages.includes('导出表格') && !pages.includes('选取美食与字段'))
  assert.ok(pages.includes('用户治理') && !pages.includes('用户治理 · 待审核'))
  assert.ok(admin.includes('admin-split') && admin.includes('admin-inspector'))
  for (const path of ["'/messages?mode=feedback&from=admin'", "'/messages?mode=issues&from=admin'", "'/messages?mode=appeals&from=admin'"]) assert.ok(admin.includes(path), path)
  assert.ok(admin.includes("'?from=admin'"), '黑榜记录带来源')
  assert.ok(css.includes('grid-template-columns:minmax(0,1fr) minmax(280px,340px)'), '宽屏两栏')
  assert.ok(css.includes('.admin-split{display:grid;gap:12px;margin-top:6px}'), '手机堆叠')
})

test('从治理页进入子页面后，返回仍回用户治理', () => {
  const messages = read('src/pages/GovernancePages.tsx')
  assert.ok(messages.includes("fromAdmin?'/admin':'/me'"), '消息/反馈返回治理页')
  const detail = read('src/pages/CloudCompose.tsx')
  assert.ok(detail.includes("get('from')==='admin'?'/admin':'/treehole'"), '黑榜详情返回治理页')
  const forum = read('src/pages/ForumDetail.tsx')
  assert.ok(forum.includes("get('from')==='admin'?'/admin':'/treehole?tab=forum'"), '讨论话题返回治理页')
})

test('避雷经历只保留店铺、美食、具体地址，不再要求消费日期', () => {
  const value = {name:'示例火锅店', dish:'豆米火锅', address:'云南大学东路校区旁 学府路 12 号', body:'这次锅底味道偏咸，结账时价格说明和菜单不一致。', tags:['味道'], confirmed:true}
  assert.equal(cautionRequiredError(value), '')
  assert.equal(cautionRequiredError({...value, date:''}), '', '消费日期不是必填项')
  assert.equal(cautionRequiredError({...value, dish:''}), '请填写美食名称。')
  assert.equal(cautionRequiredError({...value, address:' '}), '请填写至少2字的具体地址。')
})

test('演示仓储与页面同一口径：缺美食名称不保存，地址与店名落库', () => {
  const repo = createDemoRepository(createDemoState('student')), payload = {name:'示例火锅店', dish:'豆米火锅', address:'云南大学东路校区旁 学府路 12 号', body:'这次锅底味道偏咸，结账时价格说明和菜单不一致。', tags:['味道'], confirmed:true, images:[], clientRequestId:'round11-caution-0001'}
  assert.throws(() => repo.rpc('saveCaution', {...payload, dish:'', clientRequestId:'round11-caution-0002'}), /美食名称/)
  const saved = repo.rpc<any>('saveCaution', payload), row = repo.rpc<any>('caution', {id:saved.id})
  assert.equal(row.dish, '豆米火锅')
  assert.equal(row.name, '示例火锅店')
  assert.equal(row.address, '云南大学东路校区旁 学府路 12 号')
  assert.equal(row.date || '', '')
})

test('树洞避雷卡片显示美食名、缩进店名、地址与作者头像', () => {
  const app = read('src/app/App.tsx')
  assert.ok(app.includes('c.dish||c.name'))
  assert.ok(app.includes('caution-address'))
  assert.ok(app.includes('caution-byline'))
  assert.ok(app.includes('caution-avatar'))
  assert.ok(app.includes('<MediaImage src={c.avatarKey'), '作者头像')
  const detail = app.indexOf('function CautionDetail')
  assert.ok(detail > 0 && app.slice(detail, detail + 700).includes('post.dish||post.name'), '旧版详情同样按美食名展示')
})
