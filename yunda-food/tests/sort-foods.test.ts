import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {sortFoods,SORT_OPTIONS,SORT_LABELS} from '../src/domain/discovery'

// 第十轮：美食页排布方式。
const app = () => readFileSync('src/app/App.tsx', 'utf8')
const css = () => readFileSync('src/styles/app.css', 'utf8')
const food = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id, venue: '示例窗口', placeText: '示例地点', images: [], taste: {}, authorAte: true, category: '正餐', price: 12, priceBasis: 'portion', locationType: 'inside', status: 'public', ...extra }) as never
const ids = (rows: unknown[]) => (rows as { id: string }[]).map(row => row.id)

test('排布方式四种齐全，标签与顺序稳定', () => {
 assert.deepEqual(SORT_OPTIONS.map(([id]) => id), ['recommend', 'likes', 'newest', 'rating'])
 assert.deepEqual(SORT_OPTIONS.map(([, label]) => label), ['推荐顺序', '点赞最多', '最新发布', '评分最高'])
 assert.deepEqual(Object.keys(SORT_LABELS), ['recommend', 'likes', 'newest', 'rating'])
})

test('推荐顺序不打乱原始顺序', () => {
 const rows = [food('a', { likeCount: 1 }), food('b', { likeCount: 9 }), food('c', { likeCount: 4 })]
 assert.deepEqual(ids(sortFoods(rows, 'recommend')), ['a', 'b', 'c'])
 assert.deepEqual(ids(sortFoods(rows)), ['a', 'b', 'c'])
})

test('按点赞量从高到低，同赞数时新发布的靠前', () => {
 const rows = [
  food('old-high', { likeCount: 8, createdAt: '2026-10-01T00:00:00Z' }),
  food('new-high', { likeCount: 8, createdAt: '2026-11-01T00:00:00Z' }),
  food('low', { likeCount: 2, createdAt: '2026-11-05T00:00:00Z' }),
  food('none', {})
 ]
 assert.deepEqual(ids(sortFoods(rows, 'likes')), ['new-high', 'old-high', 'low', 'none'])
})

test('按发布时间从新到旧，缺时间的不抢前排', () => {
 const rows = [
  food('middle', { createdAt: '2026-10-15T00:00:00Z' }),
  food('no-date', {}),
  food('newest', { createdAt: '2026-11-10T00:00:00Z' }),
  food('oldest', { createdAt: '2026-09-01T00:00:00Z' })
 ]
 assert.deepEqual(ids(sortFoods(rows, 'newest')), ['newest', 'middle', 'oldest', 'no-date'])
})

test('按评分排序：有评价的排在无评分之前，同分看人数再看点赞', () => {
 const rows = [
  food('unrated', { likeCount: 99 }),
  food('same-rating-few', { rating: 4.5, ratingCount: 2, likeCount: 1 }),
  food('same-rating-many', { rating: 4.5, ratingCount: 7, likeCount: 0 }),
  food('top', { rating: 4.9, ratingCount: 3 })
 ]
 assert.deepEqual(ids(sortFoods(rows, 'rating')), ['top', 'same-rating-many', 'same-rating-few', 'unrated'])
})

test('重复排序结果一致，不会每次渲染跳动', () => {
 const rows = [food('a', { likeCount: 3 }), food('b', { likeCount: 3 }), food('c', { likeCount: 3 })]
 const first = ids(sortFoods(rows, 'likes'))
 assert.deepEqual(ids(sortFoods(rows, 'likes')), first)
 assert.deepEqual(first, ['a', 'b', 'c'], '同分同时间时应保持传入顺序')
})

test('首页排布行可切换，选择会记住', () => {
 const source = app()
 assert.match(source, /const \[sort,setSort\]=useState<SortMode>/)
 assert.match(source, /xsyj-home-sort/)
 assert.match(source, /sortFoods\(\(/)
 assert.match(source, /role="group" aria-label="排布方式"/)
 assert.match(source, /className=\{sort===id\?'sort-chip active':'sort-chip'\}/)
 assert.match(source, /aria-pressed=\{sort===id\}/)
 assert.match(css(), /\.sort-chip\.active\{[^}]*background:var\(--blue\)/)
})
