// Real-cloud acceptance for the 2026-11-10 image/UX round.
// Disposable external accounts and this run's own records only; exact cleanup, no credentials kept.
// Run: node scripts/verify-ux-cloud-20261110.mjs
import fs from 'node:fs'
import crypto from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {createRequire} from 'node:module'
import cloudbase from '@cloudbase/js-sdk'

const require=createRequire(import.meta.url),cli=require.resolve('@cloudbase/cli/bin/tcb'),env='cloud-yunda-d5gxrar1s14b2ee0d'
const config=Object.fromEntries(fs.readFileSync('.env.local','utf8').trim().split(/\r?\n/).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)]}))
if(config.VITE_CLOUDBASE_ENV_ID!==env||config.VITE_CLOUDBASE_BACKEND!=='classic')throw Error('Unexpected test target')
const call=args=>{let r;try{r=JSON.parse(execFileSync(process.execPath,[cli,...args,'-e',env,'--json'],{encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:10e6}))}catch{throw Error('Management operation failed')}if(r.error)throw Error(r.error.message);while(r.data&&!Array.isArray(r))r=r.data;return r}
const mongo=(name,command,type='QUERY')=>call(['db','nosql','execute','--command',JSON.stringify([{TableName:name,CommandType:type,Command:JSON.stringify(command)}])]).results[0]
const accounts=[],files=[],checks=[],inserted=[]
const app=cloudbase.init({env,region:'ap-shanghai',accessKey:config.VITE_CLOUDBASE_PUBLISHABLE_KEY}),auth=app.auth()
const ledger='.release/ux-cloud-ledger.secret.json'
fs.mkdirSync('.release',{recursive:true})
if(fs.existsSync(ledger))throw Error('Previous temporary verification resources need cleanup first')
const saveLedger=()=>fs.writeFileSync(ledger,JSON.stringify({environment:env,accounts:accounts.map(a=>({uid:a.uid,name:a.name})),files,inserted}))
let guestToken='',failure='',cleanupFailure='',protectedBasic
const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);console.log('PASS '+label)}
async function rpc(action,payload={},token=guestToken){const r=await fetch('https://'+env+'.api.tcloudbasegateway.com/v1/functions/xsyj_web_v1',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,payload})});const result=await r.json();if(!r.ok||!result.ok)throw Error(action+': '+(result.message||'Cloud request failed'));return result.data}
async function denied(action,payload,token,pattern,label){let message='';try{await rpc(action,payload,token)}catch(e){message=e.message}check(pattern.test(message),label+(message?'（实际：'+message.slice(0,60)+'）':'（没有收到任何拒绝）'))}
const store='临时验收米线店'

try{
 const anon=await auth.signInAnonymously();if(anon.error)throw Error(anon.error.message)
 guestToken=(await auth.getSession()).data.session.access_token
 check((await rpc('context')).uid===null,'匿名会话只作为游客，不生成网页权限')
 const publicFoods=await rpc('foods')
 check(Array.isArray(publicFoods)&&publicFoods.every(r=>typeof r.storeName==='string'),'真实美食列表按新结构返回店名字段（老记录为空串）')
 protectedBasic=await rpc('announcement')

 // Disposable identities: profile and avatar are prerequisites for notices and publishing.
 for(let i=0;i<3;i++){
  const name='xsyj_ux_'+Date.now()+'_'+i,password='Aa1!'+crypto.randomBytes(12).toString('hex')
  call(['user','create',name,'--password',password,'--type','externalUser'])
  const account=call(['user','list','--name',name]).find(u=>u.Name===name);if(!account?.Uid)throw Error('Temporary account lookup failed')
  accounts.push({uid:account.Uid,name,password});saveLedger()
  const login=await auth.signInWithPassword({username:name,password});if(login.error)throw Error(login.error.message)
  accounts[i].token=login.data.session.access_token
  const context=await rpc('context',{},accounts[i].token)
  check(context.uid===account.Uid&&!context.isAdmin,'真实登录 UID 由运行时识别 '+i)
  const {path}=await rpc('mediaUploadPath',{extension:'png'},accounts[i].token)
  files.push(path);saveLedger()
  const upload=await app.uploadFile({cloudPath:path,filePath:fs.readFileSync('public/assets/icons/avatar.png')})
  if(!upload.fileID)throw Error('Avatar upload failed')
  accounts[i].avatar=upload.fileID
  await rpc('saveProfile',{name:'验收同学'+['甲','乙','丙'][i],hometown:'云南省昆明市',avatarKey:upload.fileID},accounts[i].token)
  const savedProfile=await rpc('context',{},accounts[i].token)
  accounts[i].profileId=savedProfile.profileId
  if(!accounts[i].profileId)throw Error('Profile document id missing')
  check(JSON.stringify((await rpc('context',{},accounts[i].token)).profile).includes(upload.fileID),'头像真实保存并在会话中读回 '+i)
  check((await rpc('mediaUrl',{key:upload.fileID},accounts[i].token)).startsWith('https://'),'本人头像可获得访问链接 '+i)
 }
 const [a,b,c]=accounts

 // Administrator identity comes from the server-side grant table only, and must exist before the gate test.
 mongo('xsyj_admins',{insert:'xsyj_admins',documents:[{_id:'ux-admin-'+a.uid,openId:a.uid,enabled:true}]},'INSERT')
 inserted.push('xsyj_admins:ux-admin-'+a.uid);saveLedger()
 check((await rpc('context',{},a.token)).isAdmin,'管理员身份只读取 xsyj_admins 独立授权')
 await denied('adminNotices',{},b.token,/管理员/,'普通账号不能读取管理员公告管理入口')

 // 1. Administrators are never blocked by their own notice gate; ordinary accounts still are.
 await denied('favorite',{id:'not-a-real-food',favorite:true},b.token,/基本使用须知/,'普通账号未读基本须知时被准入拦截')
 await denied('favorite',{id:'not-a-real-food',favorite:true},a.token,/不可收藏/,'管理员不因自己的公告被准入拦截')
 const basic=(await rpc('announcements',{},b.token)).find(n=>n.kind==='basic')
 await rpc('ackNotice',{id:'basic',version:basic.version},b.token)
 check((await rpc('announcements',{},b.token)).find(n=>n.kind==='basic').acknowledged,'普通账号基本须知按真实身份持久保存')
 await denied('favorite',{id:'not-a-real-food',favorite:true},b.token,/不可收藏/,'已读须知后恢复原有业务校验')


 // 3. Server accepts only transcoded formats, so HEIC has to be decoded in the browser first.
 await denied('mediaUploadPath',{extension:'heic'},b.token,/格式/,'服务端拒绝 HEIC 直传，必须由前端转码后上传')

 // 4. Store name travels through submit, list, detail, edit and explicit clearing.
 // 4a. A photo is now required on every save, so upload the real sample before the first submit.
 const {path:photoPath}=await rpc('mediaUploadPath',{extension:'webp'},a.token)
 files.push(photoPath);saveLedger()
 const photoUpload=await app.uploadFile({cloudPath:photoPath,filePath:fs.readFileSync('public/assets/icons/avatar.png')})
 const payload={name:'临时验收米线',storeName:store,venue:'临时验收窗口',price:12,category:'正餐',locationType:'inside',priceBasis:'portion',school:'云南大学',campus:'呈贡校区',taste:{spicy:1,tags:[],staple:'米线'},images:[photoUpload.fileID],description:'临时验收用推荐理由，验证必填与导出列。',authorAte:true,clientRequestId:crypto.randomUUID()}
 const food=await rpc('saveFood',payload,a.token)
 check(food.storeName===store,'管理员投稿返回服务端保存的店名')
 check(food.reviewTag==='approved','管理员推荐免审仍按服务端身份判定')
 await denied('saveFood',{...payload,images:[],clientRequestId:crypto.randomUUID()},a.token,/实拍照片/,'缺少实拍照片被服务端拒绝')
 await denied('saveFood',{...payload,description:'太短',clientRequestId:crypto.randomUUID()},a.token,/推荐理由/,'推荐理由不足十个字被服务端拒绝')
 check((await rpc('food',{id:food.id})).storeName===store,'详情接口读回同一店名')
 check((await rpc('foods')).some(r=>r.id===food.id&&r.storeName===store),'公开列表携带店名，可供首页与搜索使用')
 await denied('saveFood',{...payload,storeName:'店',clientRequestId:crypto.randomUUID()},a.token,/店名/,'单字店名被服务端拒绝')
 const longStore=await rpc('saveFood',{...payload,storeName:('临时验收店名甲乙丙丁戊己庚辛壬癸').repeat(6),clientRequestId:crypto.randomUUID()},a.token)
 check(longStore?.storeName&&[...longStore.storeName].length<=40,'超长店名按服务端上限收敛而不是写坏记录')
 const kept=await rpc('saveFood',{...payload,id:food.id,storeName:undefined,clientRequestId:crypto.randomUUID()},a.token)
 check(kept.storeName===store,'编辑不传店名时保留原值，不会被静默清空')
 const cleared=await rpc('saveFood',{...payload,id:food.id,storeName:'',clientRequestId:crypto.randomUUID()},a.token)
 check(cleared.storeName==='','作者可以显式清空店名')

 const withPhoto=await rpc('saveFood',{...payload,id:food.id,storeName:store,clientRequestId:crypto.randomUUID()},a.token)
 check((await rpc('food',{id:withPhoto.id})).images.length===1,'推荐配图按转码后的通用格式真实落库')
 check((await rpc('mediaUrl',{key:photoUpload.fileID})).startsWith('https://'),'公开推荐的配图可取得访问链接')

 // 5b. 点赞只做计数：同一账号重复点赞不翻倍，取消后回到原值，计数对其他账号可见。
 const likeBase=Number((await rpc('food',{id:food.id},b.token)).likeCount||0)
 check(likeBase===0,'新投稿的点赞计数从 0 开始')
 const liked=await rpc('likeFood',{id:food.id,liked:true},b.token)
 check(liked.liked===true&&liked.likeCount===likeBase+1,'点赞后即时返回已赞状态与 +1 计数')
 check((await rpc('likeFood',{id:food.id,liked:true},b.token)).likeCount===likeBase+1,'重复点赞不会重复计数')
 const seenByOther=await rpc('food',{id:food.id},c.token)
 check(seenByOther.likeCount===likeBase+1,'点赞计数对其他账号可见')
 check(seenByOther.liked===false,'其他账号不会被误标为已赞')
 check((await rpc('foods')).find(r=>r.id===food.id)?.likeCount===likeBase+1,'公开列表携带点赞计数')
 const unliked=await rpc('likeFood',{id:food.id,liked:false},b.token)
 check(unliked.liked===false&&unliked.likeCount===likeBase,'取消点赞回到原计数')
 check((await rpc('likeFood',{id:food.id,liked:false},b.token)).likeCount===likeBase,'重复取消不会把计数减成负数')

 // 6. Legacy rows without reviewTag follow their real publication status instead of defaulting to 待审核.
 const legacyId='0ux-legacy-'+Date.now()
 mongo('xsyj_food_items',{insert:'xsyj_food_items',documents:[{_id:legacyId,ownerOpenId:b.uid,name:'临时历史遗留记录，请忽略',venue:'临时验收窗口',price:9,priceBasis:'portion',category:'正餐',locationType:'inside',school:'云南大学',campus:'呈贡校区',status:'published',imageFileIds:[],submittedAt:new Date().toISOString(),ratingAverage:0,ratingCount:0}]},'INSERT')
 inserted.push('xsyj_food_items:'+legacyId);saveLedger()
 const legacy=await rpc('food',{id:legacyId},a.token)
 check(legacy.reviewTag==='approved','无 reviewTag 的公开老记录按发布状态推导为已审核')
 check(legacy.storeName==='','老记录没有店名时输出空串，不猜造店名')
 const approvedQueue=await rpc('adminReviewQueue',{kind:'food',tag:'approved',query:'临时历史遗留记录'},a.token)
 check(approvedQueue.rows.some(r=>r.id===legacyId),'审核台已审核筛选能看到该老记录')
 const pendingQueue=await rpc('adminReviewQueue',{kind:'food',tag:'pending',query:'临时历史遗留记录'},a.token)
 check(!pendingQueue.rows.some(r=>r.id===legacyId),'公开老记录不再出现在待审核队列')

 // 7. Real pending content keeps its real state.
 const caution=await rpc('saveCaution',{name:'临时验收店铺',dish:'临时验收米线',address:'临时验收地点',body:'这是只用于本轮验收先审后公开功能的临时经历。',tags:['服务'],images:[],confirmed:true,requestId:crypto.randomUUID()},b.token)
 check(caution.status==='pending','普通用户黑榜仍为先审后发')
 const cautionDetail=await rpc('caution',{id:caution.id},b.token)
 check(cautionDetail.dish==='临时验收米线'&&!cautionDetail.date,'消费经历只保留店铺、美食与具体地址，不再要求消费日期')
 await denied('saveCaution',{name:'临时验收店铺',dish:'',address:'临时验收地点',body:'缺少美食名称时不应写入，这段文字用于验证服务端必填。',tags:['服务'],images:[],confirmed:true,requestId:crypto.randomUUID()},b.token,/美食名称/,'缺少美食名称被服务端拒绝')
 check((await rpc('caution',{id:caution.id},b.token)).reviewTag==='pending','待审黑榜的标签如实返回给作者')
 check((await rpc('adminReviewQueue',{kind:'caution',tag:'pending',query:'临时验收店铺'},a.token)).rows.some(r=>r.id===caution.id),'待审核队列包含真实待审黑榜')

 // 8. Administrators are never reminded by their own notices; ordinary accounts still are.
 const noticeBody='此公告仅用于本轮验收弹窗判定，随后立即关闭。'
 const saved=await rpc('adminSaveNotice',{title:'临时验收公告',body:noticeBody,active:true,popupEnabled:true,notifyAgain:true,clientRequestId:crypto.randomUUID()},a.token)
 const noticeId=saved.id
 if(!/^notice_[a-f0-9]{32}$/.test(noticeId))throw Error('公告标识异常：'+noticeId)
 inserted.push('xsyj_events:'+noticeId);saveLedger()
 const adminNotice=(await rpc('announcements',{},a.token)).find(n=>n.id===noticeId)
 check(adminNotice?.configuredPopupEnabled===true&&adminNotice.popupEligible===false,'管理员不被自己的公告弹窗提醒但保留公告可见性')
 const userNotice=(await rpc('announcements',{},b.token)).find(n=>n.id===noticeId)
 check(userNotice?.popupEligible===true,'普通用户仍会收到该公告的弹窗提醒')
 await rpc('adminSaveNotice',{id:noticeId,title:'临时验收公告',body:noticeBody,active:false,popupEnabled:true,notifyAgain:false,baseVersion:saved.version,clientRequestId:crypto.randomUUID()},a.token)
 check(!(await rpc('announcements',{},b.token)).some(n=>n.id===noticeId),'关闭后普通用户列表立即不再包含该公告')
 const afterBasic=(await rpc('announcements',{},a.token)).find(n=>n.kind==='basic')
 check(afterBasic.version===basic.version&&afterBasic.title===protectedBasic.title&&afterBasic.body===protectedBasic.body,'全程没有改写共享的真实基本公告')

 // 9. Business collections stay closed to browsers.
 let directReadAllowed=false
 try{await app.database().collection('xsyj_food_items').get();directReadAllowed=true}catch{}
 check(!directReadAllowed,'客户端不能绕过云函数直读业务集合')

 // 10. One rejected recommendation photo leaves the record, tells the author, and can never be reused.
 const rejectReason='验收：照片与内容无关，请重新上传。'
 const {path:userPhotoPath}=await rpc('mediaUploadPath',{extension:'webp'},b.token)
 files.push(userPhotoPath);saveLedger()
 const userPhoto=await app.uploadFile({cloudPath:userPhotoPath,filePath:fs.readFileSync('public/assets/icons/avatar.png')})
 const userFood=await rpc('saveFood',{...payload,name:'临时验收驳回用例',storeName:'',images:[userPhoto.fileID],clientRequestId:crypto.randomUUID()},b.token)
 check(JSON.stringify((await rpc('food',{id:userFood.id},b.token)).images)===JSON.stringify([userPhoto.fileID]),'待驳回的普通用户推荐已真实保存配图')
 await denied('adminRejectImage',{kind:'food',id:userFood.id,fileId:userPhoto.fileID,reason:rejectReason,clientRequestId:crypto.randomUUID()},b.token,/管理员/,'普通账号不能驳回图片')
 await denied('adminRejectImage',{kind:'food',id:userFood.id,fileId:userPhoto.fileID,reason:'短',clientRequestId:crypto.randomUUID()},a.token,/2～120/,'驳回必须填写2～120字说明')
 await denied('adminRejectImage',{kind:'food',id:userFood.id,fileId:'cloud://'+env+'.bucket/xsyj-media/'+crypto.randomUUID()+'.webp',reason:rejectReason,clientRequestId:crypto.randomUUID()},a.token,/不在该内容/,'只能驳回该内容里真实存在的照片')
 await denied('adminRejectImage',{kind:'profile',id:userFood.id,fileId:userPhoto.fileID,reason:rejectReason,clientRequestId:crypto.randomUUID()},a.token,/类型/,'图片类型只接受头像与三类内容配图')
 const rejectId=crypto.randomUUID()
 const rejected=await rpc('adminRejectImage',{kind:'food',id:userFood.id,fileId:userPhoto.fileID,reason:rejectReason,clientRequestId:rejectId},a.token)
 check(rejected.fileId===userPhoto.fileID&&rejected.remaining===0,'驳回后该配图从推荐中移除')
 const authorView=await rpc('food',{id:userFood.id},b.token)
 check(authorView.images.length===0&&String(authorView.rejectedImages?.[0]?.reason||'').includes('无关'),'作者能看到被驳回的照片与原因')
 check((await rpc('food',{id:userFood.id},a.token)).rejectedImages.length===1,'管理员同样能看到驳回记录')
 await denied('mediaUrl',{key:userPhoto.fileID},b.token,/已被驳回/,'被驳回的照片不再签发访问链接')
 await denied('saveFood',{...payload,id:userFood.id,name:'临时验收驳回用例',images:[userPhoto.fileID],clientRequestId:crypto.randomUUID()},b.token,/已被驳回/,'作者不能把同一张被驳回照片重新提交')
 const replay=await rpc('adminRejectImage',{kind:'food',id:userFood.id,fileId:userPhoto.fileID,reason:rejectReason,clientRequestId:rejectId},a.token)
 check(replay.fileId===userPhoto.fileID,'同一提交编号重放返回原结果')
 await denied('adminRejectImage',{kind:'food',id:userFood.id,fileId:userPhoto.fileID,reason:'验收：换成另一段说明。',clientRequestId:rejectId},a.token,/不一致/,'同一提交编号改内容被拒绝')
 const rejectedNotices=(await rpc('messages',{},b.token)).filter(m=>String(m.body||'').includes('未通过审核'))
 check(rejectedNotices.length===1,'作者只收到一次附图驳回通知，重放不会重复打扰')

 // 11. A rejected avatar is emptied on the profile, so every surface falls back to the default avatar.
 check((await rpc('context',{},b.token)).profile.avatar_key===b.avatar,'驳回头像前该账号仍使用原头像')
 await denied('adminRejectImage',{kind:'avatar',id:b.profileId,fileId:b.avatar,reason:'验收：头像含不适内容，请更换。',clientRequestId:crypto.randomUUID()},b.token,/管理员/,'普通账号不能驳回自己的头像逃避审核')
 const avatarReject=await rpc('adminRejectImage',{kind:'avatar',id:b.profileId,fileId:b.avatar,reason:'验收：头像含不适内容，请更换。',clientRequestId:crypto.randomUUID()},a.token)
 check(avatarReject.kind==='avatar','头像驳回按头像类型处理')
 const emptied=await rpc('context',{},b.token)
 check(emptied.profile.avatar_key==='','驳回头像后资料头像为空，前端显示默认头像')
 check(String(emptied.profile.avatar_rejected?.reason||'').includes('不适'),'作者能看到头像驳回原因')
 await denied('mediaUrl',{key:b.avatar},b.token,/已被驳回/,'被驳回的头像不再签发访问链接')
 await denied('saveProfile',{name:'验收同学乙',hometown:'云南省昆明市',avatarKey:b.avatar},b.token,/已被驳回/,'不能把被驳回的头像重新设为头像')
 const {path:newAvatarPath}=await rpc('mediaUploadPath',{extension:'png'},b.token)
 files.push(newAvatarPath);saveLedger()
 const newAvatar=await app.uploadFile({cloudPath:newAvatarPath,filePath:fs.readFileSync('public/assets/icons/avatar.png')})
 await rpc('saveProfile',{name:'验收同学乙',hometown:'云南省昆明市',avatarKey:newAvatar.fileID},b.token)
 const repaired=await rpc('context',{},b.token)
 check(repaired.profile.avatar_key===newAvatar.fileID&&!repaired.profile.avatar_rejected,'重新上传新头像后立即恢复且清掉驳回标记')
 check((await rpc('messages',{},b.token)).some(m=>String(m.body||'').includes('头像')&&String(m.body||'').includes('未通过审核')),'头像驳回同样向作者发出通知')

 // 12. The same authority covers caution evidence photos and forum topic images.
 const {path:cautionPhotoPath}=await rpc('mediaUploadPath',{extension:'webp'},b.token)
 files.push(cautionPhotoPath);saveLedger()
 const cautionPhoto=await app.uploadFile({cloudPath:cautionPhotoPath,filePath:fs.readFileSync('public/assets/icons/avatar.png')})
 const cautionWithPhoto=await rpc('saveCaution',{name:'临时验收驳回店铺',dish:'临时验收豆米火锅',address:'临时验收地点',body:'这条记录只用于验收黑榜配图驳回，随后删除。',tags:['服务'],images:[cautionPhoto.fileID],confirmed:true,requestId:crypto.randomUUID()},b.token)
 await rpc('adminRejectImage',{kind:'caution',id:cautionWithPhoto.id,fileId:cautionPhoto.fileID,reason:'验收：照片与经历不符。',clientRequestId:crypto.randomUUID()},a.token)
 const cautionAfter=await rpc('caution',{id:cautionWithPhoto.id},b.token)
 const cautionOk=cautionAfter.images.length===0&&String(cautionAfter.rejectedImages?.[0]?.reason||'').includes('不符')
 check(cautionOk,'黑榜照片驳回后同样移除并保留原因'+(cautionOk?'':'（实际：'+JSON.stringify({images:cautionAfter.images,rejected:cautionAfter.rejectedImages})+'）'))
 const {path:topicPhotoPath}=await rpc('mediaUploadPath',{extension:'webp'},b.token)
 files.push(topicPhotoPath);saveLedger()
 const topicPhoto=await app.uploadFile({cloudPath:topicPhotoPath,filePath:fs.readFileSync('public/assets/icons/avatar.png')})
 const topic=await rpc('saveForumTopic',{title:'临时验收话题驳回',body:'这条话题只用于验收树洞配图驳回，随后删除。',category:'校园生活',images:[topicPhoto.fileID],clientRequestId:crypto.randomUUID()},b.token)
 await rpc('adminRejectImage',{kind:'topic',id:topic.id,fileId:topicPhoto.fileID,reason:'验收：话题配图与内容无关。',clientRequestId:crypto.randomUUID()},a.token)
 const topicAfter=await rpc('forumTopic',{id:topic.id},b.token)
 const topicOk=topicAfter.images.length===0&&String(topicAfter.rejectedImages?.[0]?.reason||'').includes('无关')
 check(topicOk,'树洞话题配图驳回后同样移除并保留原因'+(topicOk?'':'（实际：'+JSON.stringify({images:topicAfter.images,rejected:topicAfter.rejectedImages})+'）'))

 // 13. 待审核内容只对作者与管理员可见，管理员角标必须立刻提示。
 check((await rpc('myFoods',{},b.token)).some(r=>r.id===userFood.id),'作者自己的投稿列表仍能看到待审核推荐')
 check(!(await rpc('foods')).some(r=>r.id===userFood.id),'待审核推荐不出现在游客的公开列表')
 check(!(await rpc('foods',{},c.token)).some(r=>r.id===userFood.id),'待审核推荐不出现在其他账号的公开列表')
 check(await rpc('food',{id:userFood.id},c.token)===null,'其他账号读取待审核推荐详情得到空结果')
 check((await rpc('food',{id:userFood.id},b.token)).reviewTag==='pending','作者本人仍能打开自己的待审核推荐')
 check(!(await rpc('forumTopics')).rows.some(r=>r.id===topic.id),'待审核话题不出现在公开话题列表')
 await denied('forumTopic',{id:topic.id},c.token,/不可访问/,'其他账号打不开待审核话题')
 check((await rpc('forumTopic',{id:topic.id},b.token)).reviewTag==='pending','作者本人仍能打开自己的待审核话题')
 await denied('caution',{id:caution.id},c.token,/暂不可查看/,'待审核消费经历同样只对作者可见')

 // 14. 管理员的发布默认已审核，待办角标覆盖集中审核台的全部待审内容。
 const adminCaution=await rpc('saveCaution',{name:'临时验收管理员经历',dish:'临时验收酸汤鱼',address:'临时验收地点',body:'这条经历只用于验证管理员发布默认已审核，随后删除。',tags:['服务'],images:[],confirmed:true,requestId:crypto.randomUUID()},a.token)
 const adminCautionRow=await rpc('caution',{id:adminCaution.id},a.token)
 check(adminCautionRow.reviewTag==='approved'&&adminCautionRow.status==='public','管理员发布消费经历默认已审核并公开')
 const adminTopic=await rpc('saveForumTopic',{title:'临时验收管理员话题',body:'这条话题只用于验证管理员发布默认已审核，随后删除。',category:'校园生活',images:[],clientRequestId:crypto.randomUUID()},a.token)
 check(adminTopic.reviewTag==='approved','管理员发布话题默认已审核')
 // 管理员自己写的评价同样免审：不进待审队列、别人也能立刻看到、也不给自己发审核提醒。
 const noticesBefore=mongo('xsyj_review_notifications',{find:'xsyj_review_notifications',filter:{ownerOpenId:a.uid},limit:100}).length
 await rpc('saveReview',{id:userFood.id,rating:5,text:'临时验收：管理员评价免审，随后清理。',ate:true},a.token)
 const adminReviewRow=(await rpc('reviews',{id:userFood.id},a.token)).find(r=>r.own)
 check(adminReviewRow&&adminReviewRow.reviewTag==='approved','管理员写评价默认已审核')
 check((await rpc('reviews',{id:userFood.id},c.token)).find(r=>r.rating===5)?.reviewTag==='approved','管理员评价在其他账号看来也是已审核')
 check(mongo('xsyj_review_notifications',{find:'xsyj_review_notifications',filter:{ownerOpenId:a.uid},limit:100}).length===noticesBefore,'管理员操作不给自己产生审核提醒')
 const adminSummary=await rpc('notificationSummary',{},a.token),reviewSummary=await rpc('adminReviewSummary',{},a.token)
 check(reviewSummary.pending>0,'本轮真实待审核内容立即进入集中审核台')
 check(adminSummary.pendingCount>=reviewSummary.pending,'管理员待办角标覆盖集中审核台的全部待审内容')
 check((await rpc('notificationSummary',{},c.token)).pendingCount===0,'普通账号不会拿到管理员待办角标')
 check((await rpc('myFoods',{},b.token)).every(r=>typeof r.reviewTag==='string'),'作者列表带审核标签，便于显示待审核数字')

 // 15. 管理员私信：只有管理员能发起，用户只能读自己那条对话并回复，未读并入消息汇总。
 const directBefore=(await rpc('notificationSummary',{},b.token)).unreadCount
 await denied('sendDirectMessage',{profileId:a.profileId,body:'普通用户尝试发起私信'},b.token,/管理/,'普通用户不能主动发起私信')
 await rpc('sendDirectMessage',{profileId:b.profileId,body:'验收私信：请补充窗口位置。',clientRequestId:crypto.randomUUID()},a.token)
 const thread=await rpc('adminDirectThread',{profileId:b.profileId},a.token)
 check(thread.messages.at(-1)?.body==='验收私信：请补充窗口位置。'&&thread.messages.at(-1)?.fromAdmin===true,'管理员私信写进对应用户的对话')
 check(!JSON.stringify(thread).includes(b.uid),'私信接口不向客户端暴露用户 openid')
 const directUnread=(await rpc('notificationSummary',{},b.token)).unreadCount
 check(directUnread===directBefore+1,'用户收到管理员私信后消息汇总未读+1')
 const myDirect=await rpc('myDirectMessages',{},b.token)
 check(myDirect.some(m=>!m.read&&m.fromAdmin),'用户能看到管理员私信且为未读')
 await rpc('readDirectMessages',{},b.token)
 check((await rpc('notificationSummary',{},b.token)).unreadCount===directBefore,'用户读过私信后未读回落')
 await rpc('replyDirectMessage',{profileId:c.profileId,body:'越权回复：伪造别人的主页编号。',clientRequestId:crypto.randomUUID()},b.token)
 check(!(await rpc('myDirectMessages',{},c.token)).some(m=>String(m.body).includes('越权回复')),'用户伪造主页编号也写不进别人的对话')
 await rpc('replyDirectMessage',{body:'验收回复：已经补充窗口位置。',clientRequestId:crypto.randomUUID()},b.token)
 const adminThreads=await rpc('adminDirectThreads',{},a.token)
 const adminThread=adminThreads.find(t=>t.profileId===b.profileId)
 check(Boolean(adminThread)&&adminThread.unread>=2,'管理员看到用户回复并计入未读')
 await rpc('readDirectMessages',{profileId:b.profileId},a.token)
 check((await rpc('adminDirectThreads',{},a.token)).find(t=>t.profileId===b.profileId).unread===0,'管理员打开对话后未读清零')
}catch(e){failure=e.message;console.log('FAIL '+failure)}finally{
 const cleanupErrors=[],uids=accounts.map(a=>a.uid)
 const tables=['profiles','food_items','favorites','food_likes','reviews','admins','events','direct_messages','caution_posts','caution_likes','caution_reports','caution_messages','caution_meta','caution_audit','forum_topics','forum_replies','forum_reports','forum_notifications','forum_meta','forum_audit','review_audit','review_notifications'].map(n=>'xsyj_'+n)
 const attempt=fn=>{try{fn()}catch(e){cleanupErrors.push(e.message)}}
 if(accounts.length!==3||accounts.some(a=>!a.name.startsWith('xsyj_ux_')))cleanupErrors.push('Unexpected temporary account set')
 else{
  for(const id of inserted)attempt(()=>{const [table,_id]=id.split(':');mongo(table,{delete:table,deletes:[{q:{_id},limit:1}]},'DELETE')})
  for(const name of tables)attempt(()=>{const fields=['ownerOpenId','operatorOpenId','actor','openId','updatedBy','userUid','senderUid'],filter={$or:fields.map(field=>({[field]:{$in:uids}}))},rows=mongo(name,{find:name,filter,limit:1000});if(rows.length)mongo(name,{delete:name,deletes:rows.map(row=>({q:{_id:row._id},limit:1}))},'DELETE')})
  for(const path of files)attempt(()=>{if(!path.startsWith('xsyj-media/'))throw Error('Unexpected cleanup path');call(['storage','rm',path,'--force'])})
  for(const account of accounts)attempt(()=>call(['user','delete',account.uid,'--yes']))
 }
 cleanupFailure=cleanupErrors.join('; ')
 if(!cleanupFailure&&fs.existsSync(ledger))fs.unlinkSync(ledger)
 const result={date:new Date(Date.now()+8*3600e3).toISOString().slice(0,10),executedAt:new Date().toISOString(),environment:env,mode:'real-classic-cloud',scope:'storeName-image-review-tag-notice-avatar-image-rejection-pending-visibility-badge-like',checks,failure,cleanupFailure,temporaryAccounts:accounts.length,temporaryFiles:files.length,temporaryRecords:inserted.length,credentialsPersisted:false,sharedBasicNoticeWritten:false,ledgerRemoved:!fs.existsSync(ledger)}
 fs.writeFileSync('docs/evidence/ux-cloud-20261110.json',JSON.stringify(result,null,2))
 console.log(JSON.stringify({checks:checks.length,failure,cleanupFailure}))
 process.exit(failure||cleanupFailure?1:0)
}
