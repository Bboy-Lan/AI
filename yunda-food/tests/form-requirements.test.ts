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
test('推荐必填项缺少任一项均拦截，照片理由地图和地点补充可留空',()=>{
 const food:Partial<Food>={name:'米线',category:'正餐',locationType:'inside',venue:'楠苑一楼米线窗口',price:12,priceBasis:'portion',taste:{spicy:0},authorAte:true}
 assert.equal(foodRequiredError(food),'')
 for(const key of ['name','category','locationType','venue','price','priceBasis','taste','authorAte'])assert.notEqual(foodRequiredError({...food,[key]:undefined}),'',key)
 for(const price of [0,-1,1000,NaN])assert.notEqual(foodRequiredError({...food,price}),'')
 assert.notEqual(foodRequiredError({...food,category:'饮品',taste:{spicy:1}}),'')
 assert.equal(foodRequiredError({...food,category:'饮品',taste:{sweet:0}}),'')
 assert.equal(foodRequiredError({...food,taste:{spicy:3},images:[],description:''}),'')
})
