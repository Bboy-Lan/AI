import test from 'node:test'
import assert from 'node:assert/strict'
import {foodRequiredError,profileRequiredError} from '../src/domain/form-requirements'
import type {Food} from '../src/services/local-repository'
test('个人资料只需三项，缺少任一项均拦截',()=>{
 const profile={name:'同学甲',avatar:'cloud://uploaded-avatar',province:'云南省',city:'昆明市'}
 assert.equal(profileRequiredError(profile),'')
 for(const key of ['name','avatar','province','city'])assert.notEqual(profileRequiredError({...profile,[key]:''}),'')
 assert.notEqual(profileRequiredError({...profile,name:'甲'}),'')
})
test('推荐必填项缺少任一项均拦截，学校、照片与推荐理由必填',()=>{
 const food:Partial<Food>={name:'米线',category:'正餐',locationType:'inside',school:'云南大学',campus:'东陆校区',venue:'楠苑一楼米线窗口',price:12,priceBasis:'portion',taste:{spicy:0},authorAte:true,images:['cloud://xsyj-media/photo-1.jpg'],description:'汤底很香，窗口出餐也快，适合晚课后去吃。'}
 assert.equal(foodRequiredError(food),'')
 for(const key of ['name','category','locationType','school','venue','price','priceBasis','taste','authorAte','images','description'])assert.notEqual(foodRequiredError({...food,[key]:undefined}),'',key)
 for(const price of [0,-1,1000,NaN,15.12,.5])assert.notEqual(foodRequiredError({...food,price}),'')
 assert.notEqual(foodRequiredError({...food,category:'饮品',taste:{spicy:1}}),'')
 assert.equal(foodRequiredError({...food,category:'饮品',taste:{sweet:0}}),'')
 assert.notEqual(foodRequiredError({...food,images:[]}),'')
 assert.notEqual(foodRequiredError({...food,description:'太短了'}),'')
 assert.notEqual(foodRequiredError({...food,description:'长'.repeat(501)}),'')
 assert.equal(foodRequiredError({...food,locationType:'outside',school:'',region:'',venue:'示例摊位'}),'')
})
