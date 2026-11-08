// Disposable accounts and exact new-namespace records only. No user credentials are printed or saved.
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
const accounts=[],files=[],checks=[],cautionRequests=[],knownPosts=new Set(),hash=(...v)=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0,32)
const app=cloudbase.init({env,region:'ap-shanghai',accessKey:config.VITE_CLOUDBASE_PUBLISHABLE_KEY}),auth=app.auth()
let guestToken,failure='',cleanupFailure=''
const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);console.log('PASS '+label)}
async function rpc(action,payload={},token=guestToken){const r=await fetch('https://'+env+'.api.tcloudbasegateway.com/v1/functions/xsyj_web_v1',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,payload})});const result=await r.json();if(!r.ok||!result.ok)throw Error(result.message||'Cloud request failed');return result.data}
async function denied(action,payload,token,pattern,label){let message='';try{await rpc(action,payload,token)}catch(e){message=e.message}check(pattern.test(message),label)}
try{
 const anon=await auth.signInAnonymously();if(anon.error)throw Error(anon.error.message);guestToken=(await auth.getSession()).data.session.access_token
 check((await rpc('context')).uid===null,'匿名会话只作为游客，不生成网页权限')
 check(Array.isArray(await rpc('foods'))&&Array.isArray(await rpc('cautions')),'游客读取真实空数据库与公告')
 await denied('saveFeedback',{body:'不应写入',type:'使用问题'},guestToken,/登录/,'游客不能伪造个人业务写入')
 for(let i=0;i<2;i++){
  const name='xsyj_qa_'+Date.now()+'_'+i,password='Aa1!'+crypto.randomBytes(12).toString('hex')
  call(['user','create',name,'--password',password,'--type','externalUser'])
  const account=call(['user','list','--name',name]).find(u=>u.Name===name);if(!account?.Uid)throw Error('Temporary account lookup failed')
  accounts.push({uid:account.Uid,name,password})
  const login=await auth.signInWithPassword({username:name,password});if(login.error)throw Error(login.error.message);const token=login.data.session.access_token;accounts[i].token=token
  const context=await rpc('context',{},token);check(context.uid===account.Uid&&!context.isAdmin,'真实登录UID由运行时识别 '+i)
  const {path}=await rpc('mediaUploadPath',{extension:'png'},token)
  const upload=await app.uploadFile({cloudPath:path,filePath:fs.readFileSync('public/assets/icons/avatar.png')});if(!upload.fileID)throw Error('Photo upload failed');files.push(path);accounts[i].file=upload.fileID
  await rpc('saveProfile',{name:'验收同学'+['甲','乙'][i],hometown:'云南省昆明市',avatarKey:upload.fileID},token)
  const profile=(await rpc('context',{},token));accounts[i].profileId=profile.profileId;check(profile.profile.display_name==='验收同学'+['甲','乙'][i],'头像上传与资料真实保存 '+i)
  check((await rpc('mediaUrl',{key:upload.fileID},token)).startsWith('https://'),'本人照片可获取访问链接 '+i)
 }
 const [a,b]=accounts
 mongo('xsyj_admins',{insert:'xsyj_admins',documents:[{_id:'qa-admin-'+a.uid,openId:a.uid,enabled:true}]},'INSERT')
 check((await rpc('context',{},a.token)).isAdmin,'管理员只读取xsyj_admins独立授权')
 await denied('adminFoods',{uid:a.uid,isAdmin:true},b.token,/管理员/,'普通账号不能伪造管理员')
 const payload={name:'临时验收米线',venue:'临时验收窗口',price:12,category:'正餐',locationType:'inside',priceBasis:'portion',school:'云南大学',campus:'呈贡校区',taste:{spicy:1,tags:[],staple:'米线'},images:[],authorAte:true,clientRequestId:crypto.randomUUID()}
 const food=await rpc('saveFood',payload,a.token);check(!!food.id&&food.canEdit,'真实投稿保存与本人编辑权')
 check((await rpc('saveFood',payload,a.token)).id===food.id,'投稿重试返回同一记录')
 await denied('saveFood',{...payload,id:food.id,name:'不应修改'},b.token,/自己的投稿/,'跨账号修改被原生服务端拒绝')
 await denied('saveReview',{id:food.id,ate:true,rating:5},a.token,/不能给自己|自评/,'作者不能自评')
 await rpc('saveReview',{id:food.id,ate:true,rating:4,text:'临时评价',foodVerified:true},b.token)
 await rpc('saveReview',{id:food.id,ate:true,rating:5,text:'',foodVerified:false},b.token)
 const reviews=await rpc('reviews',{id:food.id},b.token);check(reviews.length===1&&reviews[0].rating===5&&reviews[0].own&&!reviews[0].foodVerified,'同账号评价更新且不重复，字段独立')
 check((await rpc('adminProfileDetail',{id:food.id},a.token)).profile.display_name==='验收同学甲','管理员可从投稿标识进入作者管理')
 check((await rpc('adminProfileDetail',{id:reviews[0].id},a.token)).profile.display_name==='验收同学乙','管理员可从评价标识进入作者管理')
 await rpc('favorite',{id:food.id,favorite:true},b.token);await rpc('favorite',{id:food.id,favorite:true},b.token);check((await rpc('myFavorites',{},b.token)).length===1,'收藏设置具备幂等性')
 await rpc('favorite',{id:food.id,favorite:false},b.token);check((await rpc('myFavorites',{},b.token)).length===0,'收藏可取消')
 check((await rpc('publicProfile',{id:food.profileId},b.token)).profile.name==='验收同学甲','公开主页对应投稿作者')
 const req=crypto.randomUUID();cautionRequests.push({uid:b.uid,request:req})
 const caution=await rpc('saveCaution',{name:'临时验收店铺',address:'临时验收地点',date:'2026-11-01',body:'这是只用于验证先审后公开功能的临时验收经历。',tags:['服务'],images:[],confirmed:true,requestId:req},b.token);knownPosts.add(caution.id)
 check(!(await rpc('cautions')).some(r=>r.id===caution.id),'黑榜待审不向游客公开')
 await rpc('adminCautionStatus',{id:caution.id,status:'public',version:1,reason:'临时验收通过'},a.token)
 check((await rpc('cautions')).some(r=>r.id===caution.id),'黑榜通过审核后公开')
 await rpc('likeCaution',{id:caution.id,liked:true},a.token);await rpc('likeCaution',{id:caution.id,liked:true},a.token)
 check((await rpc('caution',{id:caution.id},a.token)).likes===1,'黑榜点赞幂等')
 const beforeFeedback=await rpc('feedback',{},b.token)
 await rpc('saveFeedback',{type:'使用问题',body:'这是仅用于验收的临时用户反馈。',clientRequestId:crypto.randomUUID()},b.token)
 const feedback=(await rpc('feedback',{},b.token)).find(r=>!beforeFeedback.some(v=>v.id===r.id));if(!feedback)throw Error('Feedback not found')
 await rpc('replyFeedback',{id:feedback.id,body:'这是临时管理员回复。',clientRequestId:crypto.randomUUID()},a.token)
 check((await rpc('feedback',{},b.token)).find(r=>r.id===feedback.id)?.replies.length===1,'真实反馈回复历史保留')
 await rpc('feedbackAction',{id:feedback.id,operation:'read'},b.token);check((await rpc('feedback',{},b.token)).find(r=>r.id===feedback.id)?.user_read,'反馈回复可标为已读')
 const notice=await rpc('announcement',{},a.token);await rpc('adminSaveAnnouncement',{title:'临时验收公告',body:'这是一条仅用于验收公告原位保存的临时内容。',baseVersion:notice.version,clientRequestId:crypto.randomUUID()},a.token)
 check((await rpc('announcement')).title==='临时验收公告','真实管理员公告保存与游客读回')
 await denied('adminSaveAnnouncement',{title:'不应保存',body:'普通用户不能修改公告内容。'},b.token,/管理员/,'普通用户不能修改公告')
 await rpc('adminAccountStatus',{id:b.profileId,status:'restricted',reason:'临时发布限制'},a.token)
 const appeal=await rpc('saveAppeal',{target:'publishing',body:'这是临时解禁申请。',clientRequestId:crypto.randomUUID()},b.token)
 await rpc('adminResolveAppeal',{id:appeal.id||appeal._id,status:'approve',reason:'临时验收解除'},a.token)
 check(!(await rpc('context',{},b.token)).profile.publishing_restricted,'发布限制与申诉解除闭环')
 await rpc('saveIssue',{id:food.id,type:'price_report',reason:'临时价格核对'},b.token)
 check((await rpc('adminReports',{},a.token)).some(r=>r.snapshot?.name==='临时验收米线'),'价格反馈保留原文快照')
 check(Array.isArray(await rpc('messages',{},a.token)),'互动与避雷消息可读取')
 let directReadAllowed=false;try{await app.database().collection('xsyj_profiles').get();directReadAllowed=true}catch{}
 check(!directReadAllowed,'客户端不能绕过云函数直读业务集合')
}catch(e){failure=e.message;console.log('FAIL '+failure)}finally{
 try{
  const uids=accounts.map(a=>a.uid),tables=['profiles','food_items','favorites','reviews','admins','events','caution_posts','caution_likes','caution_reports','caution_messages','caution_audit'].map(n=>'xsyj_'+n)
  const appealIds=[]
  for(const name of tables){const fields=['ownerOpenId','operatorOpenId','actor','openId','updatedBy'];const filter={$or:fields.map(field=>({[field]:{$in:uids}}))};const rows=mongo(name,{find:name,filter,limit:1000});for(const row of rows){if(name==='xsyj_events'&&row.kind==='account_appeal')appealIds.push(row._id);mongo(name,{delete:name,deletes:[{q:{_id:row._id},limit:1}]},'DELETE')}}
  if(appealIds.length){const slots=mongo('xsyj_events',{find:'xsyj_events',filter:{type:'account_appeal_slot',appealId:{$in:appealIds}},limit:100});for(const row of slots)mongo('xsyj_events',{delete:'xsyj_events',deletes:[{q:{_id:row._id},limit:1}]},'DELETE')}
  const day=new Date(Date.now()+8*3600e3).toISOString().slice(0,10),metaIds=new Set(cautionRequests.flatMap(r=>[hash('save',r.uid,r.request),hash(r.uid,day,'经历提交')]))
  const metadata=mongo('xsyj_caution_meta',{find:'xsyj_caution_meta',filter:{},limit:1000});for(const row of metadata)if(metaIds.has(row._id)||knownPosts.has(row.postId))mongo('xsyj_caution_meta',{delete:'xsyj_caution_meta',deletes:[{q:{_id:row._id},limit:1}]},'DELETE')
  for(const path of files)call(['storage','rm',path,'--force'])
  for(const a of accounts)call(['user','delete',a.uid,'--yes'])
 }catch(e){cleanupFailure=e.message;console.log('Cleanup requires follow-up: '+cleanupFailure)}
 const result={date:'2026-11-08',environment:env,mode:'real-classic-cloud',checks,failure,cleanupFailure,temporaryAccounts:accounts.length,temporaryFiles:files.length,credentialsPersisted:false}
 fs.writeFileSync('docs/evidence/classic-cloud-20261108.json',JSON.stringify(result,null,2));console.log(JSON.stringify({checks:checks.length,failure,cleanupFailure}));process.exit(failure||cleanupFailure?1:0)
}
