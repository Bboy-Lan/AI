import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {exportFileName} from '../src/domain/export-config'

// 第九轮：卡片图片、只看同乡按钮、评价折叠、点赞/收藏、导出全部美食。
const app = () => readFileSync('src/app/App.tsx', 'utf8')
const css = () => readFileSync('src/styles/app.css', 'utf8')
const exportPage = () => readFileSync('src/pages/ExportPage.tsx', 'utf8')
const service = () => readFileSync('server/classic/xsyj_web_v1/service.cjs', 'utf8')
const native = () => readFileSync('server/classic/xsyj_web_v1/native/food/index.js', 'utf8')

test('首页卡片缩略图统一为固定正方形并垂直居中，避免随内容高低而大小不一', () => {
 const rules = css()
 assert.match(rules, /\.food-card \.food-media\{[^}]*height:88px[^}]*\}/, '卡片图片应为固定高度')
 assert.ok(!/\.food-card \.food-media\{[^}]*align-self:stretch[^}]*\}/.test(rules), '卡片图片不应再随高度拉伸')
 // 紧凑列表与格子视图的尺寸不能被这条规则带跑。
 assert.match(rules, /\.food-row \.food-media\{flex:0 0 52px;height:52px/)
 assert.match(rules, /\.food-tile \.food-media\{flex:none;width:100%;height:96px/)
})

test('“只看同乡”按钮只剩主文案，副标题已删除且尺寸重新收紧', () => {
 const source = app()
 assert.ok(!/\{hometown\?'✓ 只看同乡':'只看同乡'\}<small>/.test(source), '“同省同市”副标题还在按钮里')
 assert.match(source, /className=\{hometown\?'hometown-toggle active':'hometown-toggle'\}[\s\S]{0,400}?>\{hometown\?'✓ 只看同乡':'只看同乡'\}<\/button>/)
 const rules = css()
 assert.match(rules, /\.hometown-toggle,\.filter-toggle\{[^}]*min-height:30px[^}]*padding:5px 12px/, '按钮尺寸没有重新调整')
 assert.ok(!/\.hometown-toggle small\{/.test(rules), '副标题样式应一并删除')
})

test('评价超过三条默认折叠，用户可以自己展开', () => {
 const source = app()
 assert.match(source, /const foldedReviews=reviewsOpen\?reviews:reviews\.slice\(0,3\)/)
 assert.match(source, /\{foldedReviews\.map\(review=><article className="review-card"/)
 assert.match(source, /reviews\.length>3&&<button type="button" className="review-fold" aria-expanded=\{reviewsOpen\}/)
 assert.match(source, /展开全部 '\+reviews\.length\+' 条评价/)
 // 三条以内不该出现折叠条，四条的“还有 N 条”要算对。
 assert.match(source, /还有 '\+\(reviews\.length-3\)\+' 条/)
})

test('详情页方框里新增点赞与收藏，收藏等同“下次想吃”', () => {
 const source = app()
 const actions = source.slice(source.indexOf('<div className="detail-actions"'), source.indexOf('</section>', source.indexOf('<div className="detail-actions"')))
 assert.match(actions, /className=\{food\.liked\?'button secondary action-button like-action on':'button secondary action-button like-action'\}/, '缺少点赞按钮')
 assert.match(actions, /aria-pressed=\{Boolean\(food\.liked\)\}/, '点赞按钮没有回显已赞状态')
 assert.match(actions, /className="action-count">\{food\.likeCount\|\|0\}<\/em>/, '点赞按钮没有展示计数')
 assert.match(actions, /<svg className="action-icon" viewBox="0 0 24 24"/, '点赞图标不是内置 SVG（照 bilibili 手形点赞图标画的）')
 assert.match(actions, /className=\{food\.favorite\?'button secondary action-button favorite-action on':'button secondary action-button favorite-action'\}/, '缺少收藏按钮')
 assert.match(actions, /onClick=\{favorite\}/, '收藏按钮没有接上“下次想吃”共用的收藏接口')
 assert.match(actions, /food\.favorite\?'已收藏':'想吃 · 收藏'/, '收藏文案丢了“想吃”的含义')
 assert.match(actions, /blindbox-action/, '盲盒按钮没有独占一行，三个按钮会挤成两行')
})

test('点赞接口：服务端只计数、可取消、不会减成负数', () => {
 const code = service()
 assert.match(code, /case 'likeFood':\{if\(typeof p\.liked!=='boolean'\)fail\('点赞状态无效。'\)/, '缺少点赞动作或没有校验入参')
 assert.match(code, /case 'likeFood':[\s\S]{0,420}await f\('toggleFoodLike',\{itemId:p\.id,liked:p\.liked\}\)/, '点赞没有落到原生层')
 assert.match(code, /case 'likeFood':[\s\S]{0,520}likedItems=undefined;return food\(/, '点赞后没有重置缓存并回写最新计数')
 // 喜欢与点赞各自一份缓存，避免互相污染。
 assert.match(code, /let favorites, likedItems/)
 assert.match(code, /likedItems=new Set\(uid\?await f\('getLikedItemIds'\):\[\]\)/)
 assert.match(code, /favorite:favorites\.has\(row\._id\),likeCount:Math\.max\(0,Number\(row\.likeCount\)\|\|0\),liked:likedItems\.has\(row\._id\)/)
 const raw = native()
 assert.match(raw, /async function toggleFoodLike\(id, payload\)/)
 assert.match(raw, /likeCount: Math\.max\(0, current - 1\)/, '取消点赞可能把计数减成负数')
 assert.match(raw, /getFavoriteIds, toggleFavorite, getLikedItemIds, toggleFoodLike, listReviews/, '原生层没有注册点赞动作')
})

test('点赞不进互动消息，只做计数', () => {
 const code = service()
 const branch = code.slice(code.indexOf("case 'likeFood'"), code.indexOf("case 'likeFood'") + 520)
 assert.ok(!/notify|writeNotice/.test(branch), '点赞不该产生审核或互动提醒')
})

test('导出范围新增“全部美食”并排在最前', () => {
 const page = exportPage()
 assert.match(page, /type Scope='all'\|'mine'\|'favorites'/)
 assert.match(page, /const SCOPES:Scope\[\]=\['all','mine','favorites'\]/, '“全部美食”必须排在前面')
 assert.match(page, /useState<Scope>\('all'\)/, '默认范围应为全部美食')
 assert.match(page, /const source=scope==='all'\?repository\.foods\(\)/, '全部美食没有接上网页全部公开美食')
 assert.match(page, /const sheetNameOf=\(scope:Scope\)=>scope==='all'\?'全部美食'/, '工作表名没有覆盖全部美食')
 assert.equal(exportFileName('all', new Date('2026-11-11T02:00:00Z')), '小食云记-全部美食-20261111.xlsx')
 assert.equal(exportFileName('mine', new Date('2026-11-11T02:00:00Z')), '小食云记-我的投稿-20261111.xlsx')
 assert.equal(exportFileName('favorites', new Date('2026-11-11T02:00:00Z')), '小食云记-我的收藏-20261111.xlsx')
})

test('导出“全部美食”沿用原有筛选与列配置，不绕过上限', () => {
 const page = exportPage()
 assert.match(page, /const filtered=useMemo\(\(\)=>source\.filter\(food=>matches\(food,keyword,category,location\)\)/)
 assert.match(page, /const rows=chosen\.slice\(0,EXPORT_LIMIT\)/)
})
