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
const ledger='.release/full-cloud-ledger.secret.json';fs.mkdirSync('.release',{recursive:true});if(fs.existsSync(ledger))throw Error('Previous temporary verification resources need cleanup first');const saveLedger=()=>fs.writeFileSync(ledger,JSON.stringify({environment:env,accounts:accounts.map(a=>({uid:a.uid,name:a.name})),files}));
let guestToken,failure='',cleanupFailure='',protectedNotice,concurrentRetries=0
const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);console.log('PASS '+label)}
async function rpc(action,payload={},token=guestToken){const r=await fetch('https://'+env+'.api.tcloudbasegateway.com/v1/functions/xsyj_web_v1',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,payload})});const result=await r.json();if(!r.ok||!result.ok)throw Error(action+': '+(result.message||'Cloud request failed'));return result.data}
async function denied(action,payload,token,pattern,label){let message='';try{await rpc(action,payload,token)}catch(e){message=e.message}check(pattern.test(message),label)}
try{
 const anon=await auth.signInAnonymously();if(anon.error)throw Error(anon.error.message);guestToken=(await auth.getSession()).data.session.access_token
 check((await rpc('context')).uid===null,'匿名会话只作为游客，不生成网页权限')
 check(Array.isArray(await rpc('foods'))&&Array.isArray(await rpc('cautions')),'游客读取真实美食和黑榜');protectedNotice=await rpc('announcement')
 await denied('saveFeedback',{body:'不应写入',type:'使用问题'},guestToken,/登录/,'游客不能伪造个人业务写入')
 for(let i=0;i<3;i++){
  const name='xsyj_full_'+Date.now()+'_'+i,password='Aa1!'+crypto.randomBytes(12).toString('hex')
  call(['user','create',name,'--password',password,'--type','externalUser'])
  const account=call(['user','list','--name',name]).find(u=>u.Name===name);if(!account?.Uid)throw Error('Temporary account lookup failed')
  accounts.push({uid:account.Uid,name,password});saveLedger()
  const login=await auth.signInWithPassword({username:name,password});if(login.error)throw Error(login.error.message);const token=login.data.session.access_token;accounts[i].token=token
  const context=await rpc('context',{},token);check(context.uid===account.Uid&&!context.isAdmin,'真实登录UID由运行时识别 '+i)
  const {path}=await rpc('mediaUploadPath',{extension:'png'},token)
  const upload=await app.uploadFile({cloudPath:path,filePath:fs.readFileSync('public/assets/icons/avatar.png')});if(!upload.fileID)throw Error('Photo upload failed');files.push(path);saveLedger();accounts[i].file=upload.fileID
  await rpc('saveProfile',{name:'验收同学'+['甲','乙','丙'][i],hometown:i===2?'四川省成都市':'云南省昆明市',avatarKey:upload.fileID},token)
  const profile=(await rpc('context',{},token));accounts[i].profileId=profile.profileId;check(profile.profile.display_name==='验收同学'+['甲','乙','丙'][i],'头像上传与资料真实保存 '+i)
  check((await rpc('mediaUrl',{key:upload.fileID},token)).startsWith('https://'),'本人照片可获取访问链接 '+i)
 }
 const [a,b,c]=accounts
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
 const blackPayload={name:'临时验收店铺',address:'临时验收地点',date:'2026-11-01',body:'这是只用于验证先审后公开功能的临时验收经历。',tags:['服务'],images:[],confirmed:true,requestId:req}
 await denied('saveCaution',{...blackPayload,date:'2999-01-01'},b.token,/日期/,'黑榜未来日期被拒')
 await denied('saveCaution',{...blackPayload,tags:[]},b.token,/问题/,'黑榜问题类别必填')
 const caution=await rpc('saveCaution',blackPayload,b.token);knownPosts.add(caution.id)
 check((await rpc('saveCaution',blackPayload,b.token)).id===caution.id,'黑榜重试不会多建记录')
 await denied('saveCaution',{...blackPayload,body:blackPayload.body+'改写'},b.token,/标识.*内容|内容.*一致/,'黑榜相同提交编号不能偷偷改正文')
 check(!(await rpc('cautions')).some(r=>r.id===caution.id),'黑榜待审不向游客公开')
 await denied('caution',{id:caution.id},c.token,/不可查看/,'其他用户不能读取待审经历')
 await denied('saveCaution',{...blackPayload,id:caution.id,version:1,requestId:crypto.randomUUID()},c.token,/自己的/,'黑榜不能跨账号修改')
 await rpc('adminCautionStatus',{id:caution.id,status:'returned',version:1,reason:'请补充具体事实'},a.token)
 let blackRow=await rpc('caution',{id:caution.id},b.token);check(blackRow.status==='returned','黑榜退回结果仅作者可见')
 const req2=crypto.randomUUID();cautionRequests.push({uid:b.uid,request:req2})
 await rpc('saveCaution',{...blackPayload,id:caution.id,version:blackRow.version,requestId:req2},b.token)
 blackRow=await rpc('caution',{id:caution.id},b.token)
 await rpc('adminCautionStatus',{id:caution.id,status:'public',version:blackRow.version,reason:'补充后验收通过'},a.token)
 check((await rpc('cautions')).some(r=>r.id===caution.id),'黑榜通过审核后公开')
 await rpc('likeCaution',{id:caution.id,liked:true},a.token);await rpc('likeCaution',{id:caution.id,liked:true},a.token)
 check((await rpc('caution',{id:caution.id},a.token)).likes===1,'黑榜点赞幂等')
 await rpc('likeCaution',{id:caution.id,liked:false},a.token);check((await rpc('caution',{id:caution.id},a.token)).likes===0,'黑榜可取消点赞')
 const reportRequest=crypto.randomUUID(),report=await rpc('reportCaution',{id:caution.id,reason:'请核实是否存在广告内容',requestId:reportRequest},c.token)
 await rpc('reportCaution',{id:caution.id,reason:'请核实是否存在广告内容',requestId:reportRequest},c.token)
 const req3=crypto.randomUUID();cautionRequests.push({uid:b.uid,request:req3});blackRow=await rpc('caution',{id:caution.id},b.token)
 await rpc('saveCaution',{...blackPayload,id:caution.id,version:blackRow.version,body:'这是补充具体事实后的临时验收经历，仍需重新审核。',requestId:req3},b.token)
 check(!(await rpc('cautions')).some(r=>r.id===caution.id),'黑榜公开后修改需要重新审核')
 let reports=await rpc('adminReports',{},a.token),blackReport=reports.find(r=>r.id==='caution:'+report.id)
 check(blackReport.snapshot.body===blackPayload.body,'黑榜举报快照不随作者后续编辑变化')
 await denied('adminReportAction',{id:blackReport.id,operation:'delete'},a.token,/先.*处理|先记录/,'未处理黑榜举报不能清理')
 await rpc('adminResolveReport',{id:blackReport.id,reason:'已核实并记录举报结果'},a.token)
 check((await rpc('adminReports',{},a.token)).some(r=>r.id===blackReport.id&&r.status==='resolved'),'已处理黑榜举报仍可查看')
 await rpc('adminReportAction',{id:blackReport.id,operation:'read'},a.token);await rpc('adminReportAction',{id:blackReport.id,operation:'delete'},a.token)
 check(!(await rpc('adminReports',{},a.token)).some(r=>r.id===blackReport.id),'已处理黑榜举报可清理')
 blackRow=await rpc('caution',{id:caution.id},b.token);await rpc('adminCautionStatus',{id:caution.id,status:'public',version:blackRow.version,reason:'重新审核通过'},a.token)
 await denied('saveCaution',{...blackPayload,id:caution.id,version:1,requestId:crypto.randomUUID()},b.token,/更新/,'黑榜过期版本不能覆盖新版')
 await denied('saveCaution',{...blackPayload,requestId:crypto.randomUUID()},b.token,/已达3条/,'黑榜每日提交额度有效')
 blackRow=await rpc('caution',{id:caution.id},b.token);await rpc('adminCautionStatus',{id:caution.id,status:'hidden',version:blackRow.version,reason:'临时验收下架'},a.token)
 check(!(await rpc('cautions')).some(r=>r.id===caution.id),'黑榜下架后不公开')
 blackRow=await rpc('caution',{id:caution.id},b.token);await rpc('adminCautionStatus',{id:caution.id,status:'public',version:blackRow.version,reason:'临时验收恢复'},a.token)
 blackRow=await rpc('caution',{id:caution.id},b.token);await rpc('withdrawCaution',{id:caution.id,version:blackRow.version},b.token)
 await denied('caution',{id:caution.id},guestToken,/不可查看/,'作者撤回后黑榜不再公开')
 check((await rpc('messages',{},c.token)).some(r=>r.kind==='caution'&&r.body.includes('举报处理结果')),'黑榜举报者收到处理结果通知')
 const beforeFeedback=await rpc('feedback',{},b.token)
 await rpc('saveFeedback',{type:'使用问题',body:'这是仅用于验收的临时用户反馈。',clientRequestId:crypto.randomUUID()},b.token)
 const feedback=(await rpc('feedback',{},b.token)).find(r=>!beforeFeedback.some(v=>v.id===r.id));if(!feedback)throw Error('Feedback not found')
 await rpc('replyFeedback',{id:feedback.id,body:'这是临时管理员回复。',clientRequestId:crypto.randomUUID()},a.token)
 check((await rpc('feedback',{},b.token)).find(r=>r.id===feedback.id)?.replies.length===1,'真实反馈回复历史保留')
 await rpc('feedbackAction',{id:feedback.id,operation:'read'},b.token);check((await rpc('feedback',{},b.token)).find(r=>r.id===feedback.id)?.user_read,'反馈回复可标为已读')
 const notice=await rpc('announcement',{},b.token);await rpc('ackAnnouncement',{version:notice.version},b.token)
 check((await rpc('announcement',{},b.token)).acknowledged,'真实用户可知晓当前公告而不改写内容')
 await denied('ackAnnouncement',{version:'outdated-test-version'},b.token,/更新/,'过期公告不能冒充已经知晓')
 await denied('adminSaveAnnouncement',{title:'不应保存',body:'普通用户不能修改公告内容。'},b.token,/管理员/,'普通用户不能修改公告')
 await rpc('adminAccountStatus',{id:b.profileId,status:'restricted',reason:'临时发布限制'},a.token)
 const appeal=await rpc('saveAppeal',{target:'publishing',body:'这是临时解禁申请。',clientRequestId:crypto.randomUUID()},b.token)
 await rpc('adminResolveAppeal',{id:appeal.id||appeal._id,status:'approve',reason:'临时验收解除'},a.token)
 check(!(await rpc('context',{},b.token)).profile.publishing_restricted,'发布限制与申诉解除闭环')
 await rpc('saveIssue',{id:food.id,type:'price_report',reason:'临时价格核对'},b.token)
 check((await rpc('adminReports',{},a.token)).some(r=>r.snapshot?.name==='临时验收米线'),'价格反馈保留原文快照')
 check(Array.isArray(await rpc('messages',{},a.token)),'互动与避雷消息可读取')
 const topicPayload={title:'临时验收同乡话题',body:'这是仅用于验证同乡话题和楼层回复的临时案例。',category:'同乡交流',images:[],clientRequestId:crypto.randomUUID()}
 await denied('saveForumTopic',topicPayload,guestToken,/登录/,'游客不能直接发起话题')
 const topic=await rpc('saveForumTopic',topicPayload,a.token)
 check((await rpc('saveForumTopic',topicPayload,a.token)).id===topic.id,'真实话题保存与重试幂等')
 await denied('saveForumTopic',{...topicPayload,body:'换一个正文。'},a.token,/编号.*内容/,'话题同一编号不同正文被拒')
 await denied('adminForumList',{isAdmin:true,uid:a.uid},b.token,/管理员/,'论坛管理员角色无法从事件伪造')
 const {path:forumPath}=await rpc('mediaUploadPath',{extension:'png'},c.token);files.push(forumPath);saveLedger()
 const forumUpload=await app.uploadFile({cloudPath:forumPath,filePath:fs.readFileSync('public/assets/icons/avatar.png')});if(!forumUpload.fileID)throw Error('Forum photo upload failed')
 const other=await rpc('saveForumTopic',{...topicPayload,title:'临时验收四川同乡话题',images:[forumUpload.fileID],clientRequestId:crypto.randomUUID()},c.token)
 check((await rpc('mediaUrl',{key:forumUpload.fileID})).startsWith('https://'),'非头像图片能从公开话题授权访问')
 const same=await rpc('forumTopics',{hometown:'云南省昆明市'});check(same.rows.some(r=>r.id===topic.id)&&!same.rows.some(r=>r.id===other.id),'真实同乡过滤区分不同省市')
 check((await rpc('forumTopics',{mine:true},a.token)).rows.some(r=>r.id===topic.id),'本人话题列表可读')
 await denied('forumTopics',{mine:true},guestToken,/登录/,'游客不能伪造我的话题')
 await denied('saveForumTopic',{...topicPayload,id:topic.id,version:1,clientRequestId:crypto.randomUUID()},b.token,/自己/,'论坛主题不能跨账号编辑')
 const replyPayloads=Array.from({length:8},(_,i)=>({account:i%2?b:c,payload:{topicId:topic.id,body:'临时并发楼层 '+i+'，用于验证顺序。',clientRequestId:crypto.randomUUID()}}))
 const concurrent=await Promise.allSettled(replyPayloads.map(v=>rpc('saveForumReply',v.payload,v.account.token))),created=[]
 for(let i=0;i<concurrent.length;i++){const result=concurrent[i];if(result.status==='fulfilled')created.push({...result.value,account:replyPayloads[i].account});else{concurrentRetries++;created.push({...await rpc('saveForumReply',replyPayloads[i].payload,replyPayloads[i].account.token),account:replyPayloads[i].account})}}
 const floors=(await rpc('forumReplies',{id:topic.id})).rows
 check(floors.length===8&&new Set(floors.map(r=>r.floor)).size===8&&floors.every((r,i)=>r.floor===i+1),'真实并发楼层唯一连续，不丢层或重号')
 check((await rpc('saveForumReply',replyPayloads[0].payload,replyPayloads[0].account.token)).id===created[0].id,'真实重复回复不再建一层')
 await denied('saveForumReply',{...replyPayloads[0].payload,body:'换正文'},replyPayloads[0].account.token,/编号.*内容/,'回复重试内容冲突被拒')
 const bReply=created.find(v=>v.account.uid===b.uid),quoted=await rpc('saveForumReply',{topicId:topic.id,replyTo:bReply.id,body:'引用这一楼的具体回复。',clientRequestId:crypto.randomUUID()},c.token)
 check((await rpc('messages',{},b.token)).some(r=>r.kind==='forum_reply'&&r.floor===quoted.floor&&r.target_id===topic.id),'楼层引用提醒接入原互动消息并带原楼层')
 const bn=(await rpc('messages',{},b.token)).find(r=>r.kind==='forum_reply')
 await denied('messageAction',{id:bn.id,operation:'read'},c.token,/自己的/,'论坛消息不能跨账号读取')
 await rpc('messageAction',{id:bn.id,operation:'read'},b.token);check((await rpc('messages',{},b.token)).find(r=>r.id===bn.id).read,'论坛消息可标已读')
 await rpc('messageAction',{operation:'clear'},b.token);check(!(await rpc('messages',{},b.token)).some(r=>r.id===bn.id),'统一清除已读同时覆盖论坛消息')
 await rpc('adminForumStatus',{target:'reply',id:bReply.id,version:1,status:'hidden',reason:'临时验收隐藏楼层',clientRequestId:crypto.randomUUID()},a.token)
 let hidden=(await rpc('forumReplies',{id:topic.id})).rows.find(r=>r.id===bReply.id)
 check(hidden.body===''&&hidden.floor===bReply.floor,'隐藏楼层保留楼号且公开不泄露正文')
 await rpc('adminForumStatus',{target:'reply',id:bReply.id,version:2,status:'public',reason:'临时验收恢复楼层',clientRequestId:crypto.randomUUID()},a.token)
 await rpc('withdrawForumReply',{id:bReply.id,version:3},b.token)
 check((await rpc('forumTopic',{id:topic.id})).replyCount===9,'撤回楼层不回退总楼层或重排')
 await denied('adminForumStatus',{target:'reply',id:bReply.id,version:4,status:'public',reason:'不允许的恢复',clientRequestId:crypto.randomUUID()},a.token,/撤回/,'管理员不能复活作者已撤回的楼层')
 await rpc('adminForumStatus',{target:'topic',id:other.id,version:1,status:'hidden',reason:'临时图片权限验收',clientRequestId:crypto.randomUUID()},a.token)
 await denied('forumTopic',{id:other.id},guestToken,/不可访问/,'隐藏话题不向游客公开')
 await denied('mediaUrl',{key:forumUpload.fileID},guestToken,/不可访问/,'隐藏话题的独立图片不再获得新访问链接')
 const ownHidden=await rpc('saveForumTopic',{...topicPayload,id:other.id,title:other.title,images:[forumUpload.fileID],version:2,clientRequestId:crypto.randomUUID()},c.token)
 check(ownHidden.status==='hidden','作者修改不能自行恢复管理员隐藏内容')
 await rpc('adminForumStatus',{target:'topic',id:other.id,version:3,status:'public',reason:'验收完成恢复公开',clientRequestId:crypto.randomUUID()},a.token)
 const edited=await rpc('saveForumTopic',{...topicPayload,id:topic.id,title:'临时验收更新的话题',version:1,clientRequestId:crypto.randomUUID()},a.token)
 await denied('saveForumTopic',{...topicPayload,id:topic.id,version:1,clientRequestId:crypto.randomUUID()},a.token,/更新/,'过期主题版本不能覆盖新内容')
 const reportData={target:'topic',id:topic.id,version:edited.version,reason:'请核实这条临时验收内容。',clientRequestId:crypto.randomUUID()},forumReport=await rpc('reportForum',reportData,c.token)
 check((await rpc('reportForum',reportData,c.token)).id===forumReport.id,'论坛举报重试不重复')
 const unified=(await rpc('adminReports',{},a.token)).find(r=>r.id==='forum:'+forumReport.id)
 check(unified.snapshot.title===edited.title,'论坛举报快照接入原管理举报列表')
 await denied('adminReportAction',{id:unified.id,operation:'delete'},a.token,/先记录/,'论坛未处理举报不能直接删')
 await rpc('adminResolveReport',{id:unified.id,reason:'已核实此临时验收记录'},a.token)
 check((await rpc('messages',{},c.token)).some(r=>r.kind==='forum_report'&&r.target_id===topic.id),'论坛举报处理结果送达原消息入口')
 await rpc('adminReportAction',{id:unified.id,operation:'read'},a.token);await rpc('adminReportAction',{operation:'clear'},a.token)
 check(!(await rpc('adminReports',{},a.token)).some(r=>r.id===unified.id),'统一已读清理包含处理完的论坛举报')
 await rpc('adminAccountStatus',{id:b.profileId,status:'restricted',reason:'临时讨论发布限制'},a.token)
 await denied('saveForumReply',{topicId:topic.id,body:'不能发布的回复',clientRequestId:crypto.randomUUID()},b.token,/限制发布/,'既有发布限制同样约束新增讨论')
 await rpc('adminAccountStatus',{id:b.profileId,status:'unrestrict',reason:'临时讨论验收解除'},a.token)
 await rpc('withdrawForumTopic',{id:topic.id,version:edited.version},a.token)
 await denied('saveForumReply',{topicId:topic.id,body:'撤回后不能建楼',clientRequestId:crypto.randomUUID()},b.token,/撤回或隐藏/,'主题撤回后不再允许继续回复')
 check((await rpc('forumMyReplies',{},b.token)).rows.some(r=>r.topicId===topic.id&&r.topicUnavailable),'我的回复保留不可访问原帖的本人历史')
 const freshNotice=await rpc('announcement');check(freshNotice.version===protectedNotice.version&&freshNotice.title===protectedNotice.title&&freshNotice.body===protectedNotice.body,'全程没有改写共享真实公告')
 for(const table of ['xsyj_forum_topics','xsyj_forum_replies','xsyj_forum_reports','xsyj_forum_notifications','xsyj_forum_meta','xsyj_forum_audit']){let allowed=false;try{await app.database().collection(table).get();allowed=true}catch{}check(!allowed,'客户端不能直读 '+table)}
 let directReadAllowed=false;try{await app.database().collection('xsyj_profiles').get();directReadAllowed=true}catch{}
 check(!directReadAllowed,'客户端不能绕过云函数直读业务集合')
}catch(e){failure=e.message;console.log('FAIL '+failure)}finally{
 const cleanupErrors=[],uids=accounts.map(a=>a.uid),tables=['profiles','food_items','favorites','reviews','admins','events','caution_posts','caution_likes','caution_reports','caution_messages','caution_meta','caution_audit','forum_topics','forum_replies','forum_reports','forum_notifications','forum_meta','forum_audit'].map(n=>'xsyj_'+n),appealIds=[]
 const attempt=fn=>{try{fn()}catch(e){cleanupErrors.push(e.message)}}
 const removeRows=(name,rows)=>{if(rows.length)mongo(name,{delete:name,deletes:rows.map(row=>({q:{_id:row._id},limit:1}))},'DELETE')}
 if(accounts.some(a=>!a.name.startsWith('xsyj_full_')))cleanupErrors.push('Unexpected temporary account name')
 else{
  for(const name of tables)attempt(()=>{const fields=['ownerOpenId','operatorOpenId','actor','openId','updatedBy'],filter={$or:fields.map(field=>({[field]:{$in:uids}}))},rows=mongo(name,{find:name,filter,limit:1000});for(const row of rows)if(name==='xsyj_events'&&row.kind==='account_appeal')appealIds.push(row._id);removeRows(name,rows)})
  if(appealIds.length)attempt(()=>removeRows('xsyj_events',mongo('xsyj_events',{find:'xsyj_events',filter:{type:'account_appeal_slot',appealId:{$in:appealIds}},limit:100})))
  const day=new Date(Date.now()+8*3600e3).toISOString().slice(0,10),metaIds=[...new Set([...cautionRequests.map(r=>hash('save',r.uid,r.request)),...uids.flatMap(uid=>[hash(uid,day,'经历提交'),hash(uid,day,'举报')])])]
  attempt(()=>removeRows('xsyj_caution_meta',mongo('xsyj_caution_meta',{find:'xsyj_caution_meta',filter:{$or:[{_id:{$in:metaIds}},{postId:{$in:[...knownPosts]}}]},limit:1000})))
  for(const path of files)attempt(()=>{if(!path.startsWith('xsyj-media/'))throw Error('Unexpected cleanup path');call(['storage','rm',path,'--force'])})
  for(const account of accounts)attempt(()=>call(['user','delete',account.uid,'--yes']))
 }
 cleanupFailure=cleanupErrors.join('; ')
 if(!cleanupFailure&&fs.existsSync(ledger))fs.unlinkSync(ledger)
 const result={date:'2026-11-08',environment:env,mode:'real-classic-cloud',checks,failure,cleanupFailure,temporaryAccounts:accounts.length,temporaryFiles:files.length,credentialsPersisted:false,concurrentReplies:8,concurrentRetries,sharedAnnouncementWritten:false,ledgerRemoved:!fs.existsSync(ledger)}
 fs.writeFileSync('docs/evidence/classic-cloud-20261108.json',JSON.stringify(result,null,2));console.log(JSON.stringify({checks:checks.length,failure,cleanupFailure}));process.exit(failure||cleanupFailure?1:0)
}
