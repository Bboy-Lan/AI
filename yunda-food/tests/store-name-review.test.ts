import assert from 'node:assert/strict'
import test from 'node:test'
import { reviewBadgeVisible, reviewTagOf } from '../src/domain/moderation'
import { filterItems, normalize } from '../src/domain/discovery'
import type {Food} from '../src/services/local-repository'

test('旧记录缺少审核元数据时按真实公开状态推导，不再默认待审核', () => {
  assert.equal(reviewTagOf({status:'public'}), 'approved')
  assert.equal(reviewTagOf({status:'published'}), 'approved')
  assert.equal(reviewTagOf({status:'hidden'}), 'blocked')
  assert.equal(reviewTagOf({status:'withdrawn'}), 'withdrawn')
  assert.equal(reviewTagOf({status:'rejected'}), 'changes')
  assert.equal(reviewTagOf({status:'returned'}), 'changes')
  assert.equal(reviewTagOf({status:'pending'}), 'pending')
  assert.equal(reviewTagOf({}), 'pending')
})

test('显式审核标签优先于状态推导', () => {
  assert.equal(reviewTagOf({reviewTag:'changes',status:'public'}), 'changes')
  assert.equal(reviewTagOf({reviewTag:'approved',status:'pending'}), 'approved')
  assert.equal(reviewTagOf({reviewTag:'deleted',status:'hidden'}), 'deleted')
})

test('已审核徽章不展示，其他状态仅作者或管理员可见', () => {
  assert.equal(reviewBadgeVisible('approved',{own:true,admin:true}), false)
  assert.equal(reviewBadgeVisible('pending',{own:true}), true)
  assert.equal(reviewBadgeVisible('pending',{admin:true}), true)
  assert.equal(reviewBadgeVisible('pending',{}), false)
  assert.equal(reviewBadgeVisible('changes',{}), false)
  assert.equal(reviewBadgeVisible('blocked',{own:true}), true)
})

const food=(over:Partial<Food>):Food=>({id:'x',name:'小锅米线',category:'正餐',price:12,priceBasis:'portion',locationType:'outside',placeText:'呈贡 · 仕林街',author:'同学',hometown:'云南省昆明市',tags:[],images:[],status:'public',...over})

test('搜索同时匹配店名与美食名', () => {
  const items=[food({id:'a',name:'小锅米线',storeName:'老杨米线铺'}),food({id:'b',name:'烤饵块',storeName:'仕林小摊'})]
  assert.deepEqual(filterItems(items,{keyword:'老杨'}).map(item=>item.id),['a'])
  assert.deepEqual(filterItems(items,{keyword:'烤饵块'}).map(item=>item.id),['b'])
  assert.deepEqual(filterItems(items,{keyword:'仕林小摊'}).map(item=>item.id),['b'])
  assert.deepEqual(filterItems(items,{keyword:'米线'}).map(item=>item.id),['a'])
  assert.equal(filterItems(items,{keyword:'不存在的店'}).length,0)
})

test('店名不参与口味或地点推导，旧记录不凭空生成店名', () => {
  const normalized=normalize(food({storeName:'  旧店  '}))
  assert.equal(normalized.storeName,'  旧店  ')
  const without=normalize(food({storeName:undefined}))
  assert.equal(without.storeName,undefined)
  assert.equal(without.placeText.includes('undefined'),false)
})

test('店名不影响公开状态与筛选结果', () => {
  const items=[food({id:'a',storeName:'店A'}),food({id:'b',storeName:'店B',status:'hidden'})]
  assert.deepEqual(filterItems(items,{keyword:'店'}).map(item=>item.id),['a'])
})
