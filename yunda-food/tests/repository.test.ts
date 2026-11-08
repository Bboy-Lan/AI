import assert from 'node:assert/strict'
import test from 'node:test'
import { repository } from '../src/services/local-repository'

test('评价按原小程序规则：吃过与评分必需、文字可空、同一身份更新、作者不可自评', () => {
  const values = new Map<string,string>()
  Object.defineProperty(globalThis, 'localStorage', { configurable:true, value:{
    getItem:(key:string)=>values.get(key)??null,
    setItem:(key:string,value:string)=>values.set(key,value)
  } })
  const review={id:'local-review',foodId:'f1',author:'测试同学',hometown:'云南省昆明市',rating:4,text:'',createdAt:'2026-11-05',ate:true,foodVerified:false}
  assert.throws(()=>repository.saveReview({...review,ate:false}), /亲自吃过/)
  assert.throws(()=>repository.saveReview({...review,rating:0}), /1～5/)
  assert.throws(()=>repository.saveReview({...review,author:'小云朵'}), /自己的推荐/)
  repository.saveReview(review)
  repository.saveReview({...review,id:'another-id',rating:5,foodVerified:true})
  const own=repository.reviews('f1').filter(x=>x.author===review.author)
  assert.equal(own.length,1)
  assert.equal(own[0].id,review.id)
  assert.equal(own[0].rating,5)
  assert.equal(own[0].foodVerified,true)
  assert.equal(own[0].ate,true)
  assert.equal(own[0].text,'')
  assert.throws(()=>repository.saveIssue('f1','price_report',''), /说明/)
  repository.saveIssue('f1','price_report','价格有变化')
  assert.equal(repository.foods().find(x=>x.id==='f1')?.price,12)
})
