import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import crypto from 'node:crypto'
const require=createRequire(import.meta.url),createService=require('../server/classic/xsyj_web_v1/service.cjs')
function harness(){
 const calls:any[]=[],profiles:any={a:{_id:'profile-a',foodieId:'同学甲',hometown:'云南省昆明市',avatarFileId:'cloud://avatar',ownerOpenId:'a'}}
 const service=createService({dependencies:{hash:(...p:any[])=>crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex').slice(0,32),profileFor:async(uid:string)=>profiles[uid]||null,adminFor:async(uid:string)=>uid==='admin'?{}:null},cautions:{},dispatch:async(uid:string,action:string,payload:any)=>{calls.push({uid,action,payload});if(action==='getFavoriteIds')return [];if(action==='getItem')return {_id:'food-a',ownerOpenId:'a',name:'米线',venue:'示例窗口',status:'published',submittedAt:'2026-11-08',imageFileIds:[]};if(action==='submitFeedback')return {id:'feedback-a'};return []}})
 return {service,calls}
}
test('传统后端拒绝事件伪造UID与角色、匿名写入和不在白名单的接口',async()=>{
 const{service,calls}=harness();const context=await service({uid:'guest',isAnonymous:true},'context',{uid:'admin',isAdmin:true})
 assert.equal(context.uid,null);assert.equal(context.isAdmin,false)
 await assert.rejects(()=>service({uid:'guest',isAnonymous:true},'saveFeedback',{uid:'a',body:'伪造'}),/登录/)
 await assert.rejects(()=>service({uid:'a'},'adminFoods',{uid:'admin',isAdmin:true}),/管理员/)
 await assert.rejects(()=>service({uid:'a'},'initialize',{collection:'lijin_feedback_v1'}),/不支持/)
 assert.equal(calls.length,0)
})
test('传统适配只输出公开字段，使用运行时身份与本应用照片路径',async()=>{
 const{service,calls}=harness();const food=await service({uid:'a'},'food',{id:'food-a',uid:'admin'})
 assert.equal(food.canEdit,true);assert.equal(food.profileId,'profile-a');assert.equal(food.ownerOpenId,undefined)
 assert(calls.every(c=>c.uid==='a'))
 const result=await service({uid:'a'},'mediaUploadPath',{extension:'png'})
 assert.match(result.path,/^xsyj-media\/[a-f0-9]{32}\/[a-f0-9-]+\.png$/)
 await assert.rejects(()=>service({uid:'a'},'saveProfile',{name:'同学甲',avatarKey:'cloud://cloud-yunda-d5gxrar1s14b2ee0d.bucket/lijin/avatar.png'}),/本人/)
})
test('反馈适配保留请求编号与原生校验入口，调用者不能覆盖实际身份',async()=>{
 const{service,calls}=harness();await service({uid:'a'},'saveFeedback',{uid:'admin',type:'功能建议',body:'补充说明',clientRequestId:'request-123456'})
 assert.deepEqual(calls,[{uid:'a',action:'submitFeedback',payload:{category:'功能建议',content:'补充说明',clientRequestId:'request-123456'}}])
})
