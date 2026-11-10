import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import crypto from 'node:crypto'
const require=createRequire(import.meta.url),createService=require('../server/classic/xsyj_web_v1/service.cjs')

// 待审核内容只对作者与管理员可见：公开列表、详情、收藏和评分都必须共用这一条判定。
const rows:any[]=[
 {_id:'food-approved',ownerOpenId:'a',name:'已审核推荐',venue:'一窗口',price:12,status:'published',reviewTag:'approved',submittedAt:'2026-11-08',imageFileIds:[]},
 {_id:'food-pending',ownerOpenId:'b',name:'待审核推荐',venue:'二窗口',price:12,status:'published',reviewTag:'pending',submittedAt:'2026-11-08',imageFileIds:[]},
 {_id:'food-legacy',ownerOpenId:'b',name:'没有审核标签的老记录',venue:'三窗口',price:9,status:'published',submittedAt:'2026-11-07',imageFileIds:[]}
]
function harness(){
 const calls:any[]=[],profiles:any={a:{_id:'profile-a',ownerOpenId:'a',foodieId:'同学甲',hometown:'云南省昆明市'},b:{_id:'profile-b',ownerOpenId:'b',foodieId:'同学乙',hometown:'云南省昆明市'},c:{_id:'profile-c',ownerOpenId:'c',foodieId:'同学丙',hometown:'四川省成都市'}}
 const service=createService({dependencies:{hash:(...p:any[])=>crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex').slice(0,32),profileFor:async(uid:string)=>profiles[uid]||null,adminFor:async(uid:string)=>uid==='admin'?{}:null,requireProfile:async(uid:string)=>{if(!profiles[uid])throw Error('请先完成资料。');return profiles[uid]}},cautions:{},dispatch:async(uid:string,action:string,payload:any)=>{
  calls.push({uid,action,payload})
  if(action==='listPublishedItems')return rows
  if(action==='getItem')return rows.find(r=>r._id===payload.id)||null
  if(action==='getFavoriteIds')return []
  if(action==='myFavoriteItems')return {items:rows,unavailableCount:0}
  if(action==='upsertReview')return {ok:true}
  return []
 }})
 return {service,calls}
}
test('待审核推荐不出现在首页列表，老记录按公开状态照旧展示',async()=>{
 const{service}=harness(),list=await service({uid:'c'},'foods',{})
 assert.deepEqual(list.map((f:any)=>f.id).sort(),['food-approved','food-legacy'])
 assert.equal((await service({uid:''},'foods',{})).length,2)
})
test('作者与管理员仍能看到自己的待审核推荐，详情对其他账号返回空',async()=>{
 const{service}=harness()
 assert.equal((await service({uid:'b'},'foods',{})).length,3)
 assert.equal((await service({uid:'admin'},'foods',{})).length,3)
 assert.equal(await service({uid:'c'},'food',{id:'food-pending'}),null)
 assert.equal((await service({uid:'b'},'food',{id:'food-pending'})).name,'待审核推荐')
 assert.equal((await service({uid:'admin'},'food',{id:'food-pending'})).name,'待审核推荐')
})
test('不能收藏或评论别人的待审核推荐，作者自己的收藏列表也过滤掉别人的待审内容',async()=>{
 const{service,calls}=harness()
 await assert.rejects(()=>service({uid:'c'},'favorite',{id:'food-pending',favorite:true}),/暂不可收藏/)
 await assert.rejects(()=>service({uid:'c'},'saveReview',{id:'food-pending',rating:5,ate:true}),/暂不可评分/)
 assert(!calls.some(c=>c.action==='upsertReview'))
 const favorites=await service({uid:'c'},'myFavorites',{})
 assert.deepEqual(favorites.map((f:any)=>f.id).sort(),['food-approved','food-legacy'])
})
