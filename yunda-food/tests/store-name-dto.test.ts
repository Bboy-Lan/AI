import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import crypto from 'node:crypto'

const require=createRequire(import.meta.url),createService=require('../server/classic/xsyj_web_v1/service.cjs')

function harness(row:Record<string,unknown>){
 const service=createService({
  dependencies:{
   hash:(...parts:unknown[])=>crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0,32),
   profileFor:async()=>null,
   adminFor:async()=>null,
  },
  cautions:{},
  dispatch:async(_uid:string,action:string)=>{
   if(action==='getItem')return row
   if(action==='getFavoriteIds')return []
   return []
  },
 })
 return service
}

test('推荐详情 DTO 返回独立店名字段，旧记录为空字符串',async()=>{
 const base={_id:'food-1',ownerOpenId:'owner',name:'小锅米线',venue:'楠苑一楼 3 号窗口',status:'published',submittedAt:'2026-11-09',imageFileIds:[],price:12,priceBasis:'portion',reviewTag:'approved'}
 const withStore=await harness({...base,storeName:'老杨米线铺'})({uid:'viewer'},'food',{id:'food-1'})
 assert.equal(withStore.storeName,'老杨米线铺')
 assert.equal(withStore.name,'小锅米线')
 assert.notEqual(withStore.storeName,withStore.name)
 const legacy=await harness(base)({uid:'viewer'},'food',{id:'food-1'})
 assert.equal(legacy.storeName,'')
})
