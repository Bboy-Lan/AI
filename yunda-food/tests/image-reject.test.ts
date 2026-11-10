import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {createRequire} from 'node:module'
import {memoryDb} from './support/memory-db'

const require=createRequire(import.meta.url)
const createImageReview=require('../server/classic/xsyj_web_v1/image-review.cjs')
const createService=require('../server/classic/xsyj_web_v1/service.cjs')

const BUCKET='cloud://cloud-yunda-d5gxrar1s14b2ee0d.7465-cloud-yunda-d5gxrar1s14b2ee0d-1300000000'
const file=(name:string)=>BUCKET+'/xsyj-media/owner-hash/'+name
const hash=(...parts:unknown[])=>crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0,32)

function setup(){
 const memory=memoryDb(),fail=(message:string)=>{throw Error(message)},
  service=createImageReview({db:memory.db,fail,text:(value:unknown,size:number)=>String(value??'').trim().slice(0,size),now:()=>new Date('2026-11-10T02:00:00Z'),hash,requireAdmin:async(uid:string)=>{if(uid!=='admin')throw Error('无管理员权限。')}})
 memory.seed('xsyj_food_items',[{_id:'food-a',ownerOpenId:'a',name:'小锅米线',status:'published',imageFileIds:[file('one.jpg'),file('two.jpg')],reviewVersion:0}])
 memory.seed('xsyj_caution_posts',[{_id:'caution-a',ownerOpenId:'a',name:'示例店铺',status:'published',imageFileIds:[file('three.jpg')]}])
 memory.seed('xsyj_forum_topics',[{_id:'topic-a',ownerOpenId:'a',title:'同乡话题',status:'public',images:[file('four.jpg')]}])
 memory.seed('xsyj_profiles',[{_id:'profile-a',ownerOpenId:'a',foodieId:'同学甲',avatarFileId:file('avatar.jpg')}])
 return {...memory,service}
}

test('管理员驳回推荐配图后图片移除、留痕并通知作者重新上传',async()=>{
 const {service,rows}=setup()
 const result=await service.reject('admin',{kind:'food',id:'food-a',fileId:file('one.jpg'),reason:'照片含二维码，请换一张实拍图。',clientRequestId:'reject-food-0001'})
 assert.equal(result.remaining,1)
 const row:any=rows('xsyj_food_items').find((r:any)=>r._id==='food-a')
 assert.deepEqual(row.imageFileIds,[file('two.jpg')])
 assert.equal(row.rejectedImages.length,1)
 assert.equal(row.rejectedImages[0].reason,'照片含二维码，请换一张实拍图。')
 assert.equal(await service.isRejected(file('one.jpg')),true)
 assert.equal(await service.isRejected(file('two.jpg')),false)
 const notice:any=rows('xsyj_review_notifications')[0]
 assert.equal(notice.kind,'content_review')
 assert.equal(notice.tag,'changes')
 assert.equal(notice.ownerOpenId,'a')
 assert.equal(notice.editPath,'/publish/food-a')
 assert.match(notice.body,/未通过审核/)
 assert.match(notice.body,/二维码/)
 const audit:any=rows('xsyj_events').find((r:any)=>r.type==='image_rejection')
 assert.equal(audit.fileId,file('one.jpg'))
 assert.equal(audit.operatorOpenId,'admin')
})

test('同一提交编号重放只处理一次，不会重复写通知或再删一张图',async()=>{
 const {service,rows}=setup()
 const payload={kind:'food',id:'food-a',fileId:file('one.jpg'),reason:'照片不符合要求，请重新上传。',clientRequestId:'reject-food-0002'}
 const first=await service.reject('admin',payload)
 const second=await service.reject('admin',payload)
 assert.deepEqual(first,second)
 const row:any=rows('xsyj_food_items').find((r:any)=>r._id==='food-a')
 assert.deepEqual(row.imageFileIds,[file('two.jpg')])
 assert.equal(rows('xsyj_review_notifications').length,1)
})

test('非管理员、理由不足、照片不属于该内容都被拒绝',async()=>{
 const {service,rows}=setup()
 await assert.rejects(()=>service.reject('a',{kind:'food',id:'food-a',fileId:file('one.jpg'),reason:'不合格照片',clientRequestId:'reject-food-0003'}),/管理员/)
 await assert.rejects(()=>service.reject('admin',{kind:'food',id:'food-a',fileId:file('one.jpg'),reason:'短',clientRequestId:'reject-food-0004'}),/驳回说明/)
 await assert.rejects(()=>service.reject('admin',{kind:'food',id:'caution-a',fileId:file('one.jpg'),reason:'不属于这里',clientRequestId:'reject-food-0005'}),/原内容不存在|找不到|不在该内容/)
 await assert.rejects(()=>service.reject('admin',{kind:'food',id:'food-a',fileId:'https://example.com/a.jpg',reason:'非法标识照片',clientRequestId:'reject-food-0006'}),/照片标识/)
 await assert.rejects(()=>service.reject('admin',{kind:'unknown',id:'food-a',fileId:file('one.jpg'),reason:'类型不对照片',clientRequestId:'reject-food-0007'}),/类型/)
 assert.equal(rows('xsyj_review_notifications').length,0)
})

test('驳回头像会清空头像并记录原因，作者必须换一张',async()=>{
 const {service,rows}=setup()
 const result=await service.reject('admin',{kind:'avatar',fileId:file('avatar.jpg'),reason:'头像不是本人实拍，请更换。',clientRequestId:'reject-avatar-0001'})
 assert.equal(result.kind,'avatar')
 assert.equal(result.id,'profile-a')
 const profile:any=rows('xsyj_profiles').find((r:any)=>r._id==='profile-a')
 assert.equal(profile.avatarFileId,'')
 assert.equal(profile.avatarRejected.fileId,file('avatar.jpg'))
 assert.equal(profile.avatarRejected.reason,'头像不是本人实拍，请更换。')
 assert.equal(await service.isRejected(file('avatar.jpg')),true)
 const notice:any=rows('xsyj_review_notifications')[0]
 assert.equal(notice.editPath,'/onboarding')
 assert.match(notice.body,/头像/)
})

test('黑榜与话题按各自字段移除照片',async()=>{
 const {service,rows}=setup()
 await service.reject('admin',{kind:'caution',id:'caution-a',fileId:file('three.jpg'),reason:'照片不清晰，请重新拍摄。',clientRequestId:'reject-caution-0001'})
 await service.reject('admin',{kind:'topic',id:'topic-a',fileId:file('four.jpg'),reason:'照片与话题无关，请更换。',clientRequestId:'reject-topic-0001'})
 assert.deepEqual((rows('xsyj_caution_posts')[0] as any).imageFileIds,[])
 assert.deepEqual((rows('xsyj_forum_topics')[0] as any).images,[])
 assert.equal(rows('xsyj_review_notifications').length,2)
})

test('驳回结论在单次请求内可缓存，跨请求不误判',async()=>{
 const {service}=setup()
 await service.reject('admin',{kind:'food',id:'food-a',fileId:file('one.jpg'),reason:'缓存验证用照片驳回',clientRequestId:'reject-food-0008'})
 const cache=new Map<string,boolean>()
 assert.equal(await service.isRejected(file('one.jpg'),cache),true)
 assert.equal(await service.isRejected(file('one.jpg'),cache),true)
 assert.equal(cache.get(file('one.jpg')),true)
 assert.equal(await service.isRejected(file('two.jpg'),cache),false)
})

function projectionHarness(options:{uid?:string,admin?:boolean,row:Record<string,unknown>,profile?:Record<string,unknown>}){
 const service=createService({
  dependencies:{hash,profileFor:async()=>options.profile||null,adminFor:async(uid:string)=>options.admin?{openId:uid}:null,mediaUrl:async()=>'https://example.test/photo'},
  cautions:{},
  imageReview:{rejected:false,isRejected:async()=>options.row.rejectedFlag===true},
  dispatch:async(_uid:string,action:string)=>{if(action==='getItem')return options.row;if(action==='getFavoriteIds')return [];return []},
 })
 return service
}

test('驳回清单只返回给作者与管理员，公开视图不泄露',async()=>{
 const row={_id:'food-a',ownerOpenId:'a',name:'米线',status:'published',submittedAt:'2026-11-10',imageFileIds:[file('two.jpg')],rejectedImages:[{fileId:file('one.jpg'),reason:'照片含二维码'}],reviewTag:'approved'}
 const own=await projectionHarness({row,uid:'a'})({uid:'a'},'food',{id:'food-a'})
 assert.deepEqual(own.rejectedImages,[{fileId:file('one.jpg'),reason:'照片含二维码'}])
 const admin=await projectionHarness({row,uid:'admin',admin:true})({uid:'admin'},'food',{id:'food-a'})
 assert.equal(admin.rejectedImages.length,1)
 const stranger=await projectionHarness({row,uid:'b'})({uid:'b'},'food',{id:'food-a'})
 assert.deepEqual(stranger.rejectedImages,[])
})

test('资料 DTO 对本人暴露被驳回头像原因，头像字段为空以便显示默认头像',async()=>{
 const profile={_id:'profile-a',ownerOpenId:'a',foodieId:'同学甲',avatarFileId:'',avatarRejected:{fileId:file('avatar.jpg'),reason:'头像不是本人实拍'},accountStatus:'active'}
 const service=projectionHarness({uid:'a',row:{},profile})
 const context:any=await service({uid:'a'},'context',{})
 assert.equal(context.profile.avatar_key,'')
 assert.equal(context.profile.avatar_rejected.reason,'头像不是本人实拍')
})

test('被驳回的照片不再返回访问链接',async()=>{
 const key=BUCKET+'/xsyj-media/'+hash('a')+'/rejected.jpg'
 const service=projectionHarness({uid:'a',row:{rejectedFlag:true}})
 await assert.rejects(()=>service({uid:'a'},'mediaUrl',{key}),/已被驳回/)
})
