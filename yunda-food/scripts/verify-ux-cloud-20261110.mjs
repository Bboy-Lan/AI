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
async function denied(action,payload,token,pattern,label){let message='';try{await rpc(action,payload,token)}catch(e){message=e.message}check(pattern.test(message),label+(message?'':'：没有收到预期拒绝'))}
const store='临时验收米线店'

try{
 const anon=await auth.signInAnonymously();if(anon.error)throw Error(anon.error.message)
 guestToken=(await auth.getSession()).data.session.access_token
 check((await rpc('context')).uid===null,'匿名会话只作为游客，不生成网页权限')
 const publicFoods=await rpc('foods')
 check(Array.isArray(publicFoods)&&publicFoods.every(r=>typeof r.storeName==='string'),'真实美食列表按新结构返回店名字段（老记录为空串）')
 protectedBasic=await rpc('announcement')

 // Disposable identities: profile and avatar are prerequisites for notices and publishing.
 for(let i=0;i<2;i++){
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
  await rpc('saveProfile',{name:'验收同学'+['甲','乙'][i],hometown:'云南省昆明市',avatarKey:upload.fileID},accounts[i].token)
  check(JSON.stringify((await rpc('context',{},accounts[i].token)).profile).includes(upload.fileID),'头像真实保存并在会话中读回 '+i)
  check((await rpc('mediaUrl',{key:upload.fileID},accounts[i].token)).startsWith('https://'),'本人头像可获得访问链接 '+i)
 }
 const [a,b]=accounts

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
 const payload={name:'临时验收米线',storeName:store,venue:'临时验收窗口',price:12,category:'正餐',locationType:'inside',priceBasis:'portion',school:'云南大学',campus:'呈贡校区',taste:{spicy:1,tags:[],staple:'米线'},images:[],authorAte:true,clientRequestId:crypto.randomUUID()}
 const food=await rpc('saveFood',payload,a.token)
 check(food.storeName===store,'管理员投稿返回服务端保存的店名')
 check(food.reviewTag==='approved','管理员推荐免审仍按服务端身份判定')
 check((await rpc('food',{id:food.id})).storeName===store,'详情接口读回同一店名')
 check((await rpc('foods')).some(r=>r.id===food.id&&r.storeName===store),'公开列表携带店名，可供首页与搜索使用')
 await denied('saveFood',{...payload,storeName:'店',clientRequestId:crypto.randomUUID()},a.token,/店名/,'单字店名被服务端拒绝')
 const longStore=await rpc('saveFood',{...payload,storeName:('临时验收店名甲乙丙丁戊己庚辛壬癸').repeat(6),clientRequestId:crypto.randomUUID()},a.token)
 check(longStore?.storeName&&[...longStore.storeName].length<=40,'超长店名按服务端上限收敛而不是写坏记录')
 const kept=await rpc('saveFood',{...payload,id:food.id,storeName:undefined,clientRequestId:crypto.randomUUID()},a.token)
 check(kept.storeName===store,'编辑不传店名时保留原值，不会被静默清空')
 const cleared=await rpc('saveFood',{...payload,id:food.id,storeName:'',clientRequestId:crypto.randomUUID()},a.token)
 check(cleared.storeName==='','作者可以显式清空店名')

 // 5. Recommendation photo uses the pipeline's real output type and stays authorization-scoped.
 const {path:photoPath}=await rpc('mediaUploadPath',{extension:'webp'},a.token)
 files.push(photoPath);saveLedger()
 const photoUpload=await app.uploadFile({cloudPath:photoPath,filePath:fs.readFileSync('public/assets/icons/avatar.png')})
 const withPhoto=await rpc('saveFood',{...payload,id:food.id,storeName:store,images:[photoUpload.fileID],clientRequestId:crypto.randomUUID()},a.token)
 check((await rpc('food',{id:withPhoto.id})).images.length===1,'推荐配图按转码后的通用格式真实落库')
 check((await rpc('mediaUrl',{key:photoUpload.fileID})).startsWith('https://'),'公开推荐的配图可取得访问链接')

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
 const caution=await rpc('saveCaution',{name:'临时验收店铺',address:'临时验收地点',date:'2026-11-01',body:'这是只用于本轮验收先审后公开功能的临时经历。',tags:['服务'],images:[],confirmed:true,requestId:crypto.randomUUID()},b.token)
 check(caution.status==='pending','普通用户黑榜仍为先审后发')
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
}catch(e){failure=e.message;console.log('FAIL '+failure)}finally{
 const cleanupErrors=[],uids=accounts.map(a=>a.uid)
 const tables=['profiles','food_items','favorites','reviews','admins','events','caution_posts','caution_likes','caution_reports','caution_messages','caution_meta','caution_audit','forum_topics','forum_replies','forum_reports','forum_notifications','forum_meta','forum_audit','review_audit','review_notifications'].map(n=>'xsyj_'+n)
 const attempt=fn=>{try{fn()}catch(e){cleanupErrors.push(e.message)}}
 if(accounts.length!==2||accounts.some(a=>!a.name.startsWith('xsyj_ux_')))cleanupErrors.push('Unexpected temporary account set')
 else{
  for(const id of inserted)attempt(()=>{const [table,_id]=id.split(':');mongo(table,{delete:table,deletes:[{q:{_id},limit:1}]},'DELETE')})
  for(const name of tables)attempt(()=>{const fields=['ownerOpenId','operatorOpenId','actor','openId','updatedBy'],filter={$or:fields.map(field=>({[field]:{$in:uids}}))},rows=mongo(name,{find:name,filter,limit:1000});if(rows.length)mongo(name,{delete:name,deletes:rows.map(row=>({q:{_id:row._id},limit:1}))},'DELETE')})
  for(const path of files)attempt(()=>{if(!path.startsWith('xsyj-media/'))throw Error('Unexpected cleanup path');call(['storage','rm',path,'--force'])})
  for(const account of accounts)attempt(()=>call(['user','delete',account.uid,'--yes']))
 }
 cleanupFailure=cleanupErrors.join('; ')
 if(!cleanupFailure&&fs.existsSync(ledger))fs.unlinkSync(ledger)
 const result={date:new Date(Date.now()+8*3600e3).toISOString().slice(0,10),executedAt:new Date().toISOString(),environment:env,mode:'real-classic-cloud',scope:'storeName-image-review-tag-notice-avatar',checks,failure,cleanupFailure,temporaryAccounts:accounts.length,temporaryFiles:files.length,temporaryRecords:inserted.length,credentialsPersisted:false,sharedBasicNoticeWritten:false,ledgerRemoved:!fs.existsSync(ledger)}
 fs.writeFileSync('docs/evidence/ux-cloud-20261110.json',JSON.stringify(result,null,2))
 console.log(JSON.stringify({checks:checks.length,failure,cleanupFailure}))
 process.exit(failure||cleanupFailure?1:0)
}
