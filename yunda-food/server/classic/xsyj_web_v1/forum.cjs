const crypto=require('node:crypto')
const hometown=require('./native/food/hometown')
const PUBLIC=new Set(['forumTopics','forumTopic','forumReplies'])
const ACTIONS=new Set([...PUBLIC,'forumOwnReply','editForumReply','forumMyReplies','saveForumTopic','saveForumReply','withdrawForumTopic','withdrawForumReply','reportForum','adminForumList','adminForumStatus','adminForumResolve','adminForumReportAction','forumNotifications','forumNotificationAction','forumSummary'])
const C={topics:'xsyj_forum_topics',replies:'xsyj_forum_replies',reports:'xsyj_forum_reports',notifications:'xsyj_forum_notifications',meta:'xsyj_forum_meta',audit:'xsyj_forum_audit'}
const categories=['同乡交流','校园生活','吃喝吐槽']
// 待审核话题与楼层只对作者与管理员可见，与推荐使用同一条审核标签规则。
const tagOf=require('./moderation.cjs').tag
const hiddenFrom=(row,identity)=>!identity.admin&&row.ownerOpenId!==identity.uid&&tagOf(row)!=='approved'
module.exports=function createForum(d){
 const {db,fail,now,hash,profileFor,requireProfile,requireAdmin,adminFor,chinaDay,imageReview}=d
 const get=async(store,name,id)=>{try{return (await store.collection(name).doc(id).get()).data||null}catch(e){if(/not.?found|not.?exist|不存在|DOCUMENT_NOT_FOUND/i.test(String(e.message||e.errMsg||'')))return null;throw e}}
 const set=(tx,name,id,data)=>{const {_id,...fields}=data;return tx.collection(name).doc(id).set({data:fields})}
 const clean=(v,min,max,label)=>{if(typeof v!=='string')fail('请填写'+label+'。');const s=v.trim();if(s.length<min||s.length>max)fail(label+'需'+min+'～'+max+'字。');if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s))fail(label+'含有不可见控制字符。');return s}
 const req=v=>{if(typeof v!=='string'||!/^[a-zA-Z0-9_-]{12,80}$/.test(v))fail('提交标识无效，请保留输入后重试。');return v}
 const sequence=()=>String(Date.now()).padStart(13,'0')+'-'+crypto.randomBytes(8).toString('hex')
 const stamp=v=>{if(!v)return '';const date=new Date(v.$date||v);return Number.isFinite(date.getTime())?date.toISOString():''}
 const photos=async(uid,images)=>{const prefix='cloud://cloud-yunda-d5gxrar1s14b2ee0d.';if(!Array.isArray(images)||images.length>3||images.some(v=>typeof v!=='string'||!v.startsWith(prefix)||!v.includes('/xsyj-media/'+hash(uid)+'/')||v.includes('..')))fail('请使用本人上传的照片，最多3张。');const list=[...new Set(images)];if(imageReview)for(const file of list)if(await imageReview.isRejected(file))fail('这张照片已被驳回，请重新上传一张。');return list}
 async function quota(tx,uid,kind,limit){const id=hash('forum-quota',uid,chinaDay(),kind),old=await get(tx,C.meta,id);if((old?.value||0)>=limit)fail('今天的'+kind+'已达'+limit+'次，请明天再试。');await set(tx,C.meta,id,{ownerOpenId:uid,kind,day:chinaDay(),value:(old?.value||0)+1})}
 async function receipt(tx,uid,action,payload){const id=hash('forum-request',uid,action,req(payload.clientRequestId)),signature=hash(payload),old=await get(tx,C.meta,id);if(old&&old.signature!==signature)fail('提交编号与内容不一致，请保留输入重新提交。');return {id,signature,old:old?.result}}
 const record=(tx,uid,r,result)=>set(tx,C.meta,r.id,{ownerOpenId:uid,signature:r.signature,result,createdAt:now()})
 const audit=(tx,uid,targetType,targetId,topicId,action,reason,snapshot)=>set(tx,C.audit,hash(uid,targetType,targetId,action,sequence()),{operatorOpenId:uid,targetType,targetId,topicId,action,reason,snapshot,createdAt:now()})
 async function author(uid,cache){if(!cache.has(uid))cache.set(uid,Promise.all([profileFor(uid),adminFor(uid)]));const [p,admin]=await cache.get(uid);return {profileId:p?._id||'',name:p?.foodieId||'同学',avatarKey:p?.avatarFileId||'',hometown:p?.hometown||'',isAdmin:Boolean(admin),exp:p?Math.max(0,Math.floor(Number(p.activityExp)||0)):0,streak:p&&Number.isInteger(p.activityStreak)&&p.activityStreak>0?p.activityStreak:0}}
 async function topicDto(row,identity,cache=new Map()){if(row.reviewTag==='deleted'&&!identity.admin)row={...row,body:'此话题已删除，处理意见请查看互动消息。',images:[]};return {...require('./moderation.cjs').fields(row),id:row._id,title:row.title,body:row.body,category:row.category,hometown:row.hometown,images:row.images||[],status:row.status,version:row.version,replyCount:row.replyCount||0,sequence:row.sequence,createdAt:stamp(row.createdAt),updatedAt:stamp(row.updatedAt),own:row.ownerOpenId===identity.uid,rejectedImages:row.ownerOpenId===identity.uid||identity.admin?(row.rejectedImages||[]).map(v=>({fileId:v.fileId,reason:v.reason||''})):[],canEdit:row.ownerOpenId===identity.uid&&row.status!=='withdrawn'&&row.reviewTag!=='deleted',reason:row.ownerOpenId===identity.uid||identity.admin?row.reason||'':'',author:await author(row.ownerOpenId,cache)}}
  async function replyDto(row,identity,cache=new Map()){
  const own=row.ownerOpenId===identity.uid,pending=hiddenFrom(row,identity),readBody=(row.status==='public'&&!pending)||own||identity.admin,key='topic:'+row.topicId
  if(!cache.has(key))cache.set(key,get(db,C.topics,row.topicId))
  const topic=await cache.get(key)
  return {...require('./moderation.cjs').fields(row),id:row._id,topicId:row.topicId,topicTitle:topic?.title||'已不可访问的话题',topicUnavailable:!topic||topic.status!=='public'&&topic.ownerOpenId!==identity.uid&&!identity.admin,body:readBody&&(row.reviewTag!=='deleted'||identity.admin)?row.body:'',status:row.status,reviewPending:pending,floor:row.floor,replyToFloor:row.replyToFloor||0,version:row.version,sequence:row.sequence,own,reason:own||identity.admin?row.reason||'':'',createdAt:stamp(row.createdAt),author:await author(row.ownerOpenId,cache),isTopicAuthor:!!topic&&row.ownerOpenId===topic.ownerOpenId}
 }
 async function visible(id,identity,store=db){const row=await get(store,C.topics,id);if(!row||row.status!=='public'&&row.ownerOpenId!==identity.uid&&!identity.admin)fail('这条话题暂不可访问。');return row}
 async function page(name,where,after){if(after&& !/^\d{13}-[a-f0-9]{16}$/.test(after))fail('分页标识无效，请刷新列表。');const rows=(await db.collection(name).where({...where,...(after?{sequence:db.command.lt(after)}:{})}).orderBy('sequence','desc').limit(21).get()).data;return {rows:rows.slice(0,20),next:rows.length>20?rows[19].sequence:''}}
 async function notify(tx,recipient,kind,topicId,source,floor,body,actor){if(!recipient)return;const id=hash('forum-notice',recipient,kind,source);if(await get(tx,C.notifications,id))return;await set(tx,C.notifications,id,{ownerOpenId:recipient,kind,topicId,floor:floor||0,body,actor:actor||'',read:false,archived:false,sequence:sequence(),createdAt:now()})}
 async function reportDto(row,identity,cache){const {ownerOpenId,targetOwnerId,...snapshot}=row.snapshot||{};return {id:row._id,kind:'forum_report',target_id:row.topicId,target_type:'forum',topicId:row.topicId,floor:row.floor||0,target:row.target,targetId:row.targetId,reason:row.reason,body:row.reason,status:row.status,read:!!row.read,resolution:row.resolution||'',snapshot,reporter:await author(row.ownerOpenId,cache),created_at:stamp(row.createdAt),sequence:row.sequence}}
 return async function forum(identity,action,p={}){
  const uid=identity.uid||''
  if(!ACTIONS.has(action))fail('不支持这项讨论操作。')
  if(!PUBLIC.has(action)&&!uid||action==='forumTopics'&&p.mine&&!uid)fail('请先登录网页账号。')
  if(action.startsWith('admin'))await requireAdmin(uid)
  if(identity.profile?.accountStatus==='banned')fail('账号已封禁，请通过反馈申请复核。')
  if(action==='forumTopics'){
   const where=p.mine?{ownerOpenId:uid}:{status:'public'}
   if(p.hometown){const home=hometown.parse(p.hometown);if(!home)fail('请先选择完整的家乡省市。');where.hometown=home.value}
   const result=await page(C.topics,where,p.after),cache=new Map(),shown=p.mine?result.rows:result.rows.filter(row=>!hiddenFrom(row,identity));return {rows:await Promise.all(shown.map(row=>topicDto(row,identity,cache))),next:result.next}
  }
  if(action==='forumTopic'){const row=await visible(p.id,identity);if(hiddenFrom(row,identity))fail('这条话题暂不可访问。');return topicDto(row,identity)}
  if(action==='forumReplies'){
   await visible(p.id,identity);const after=Number(p.afterFloor||0);if(!Number.isInteger(after)||after<0)fail('楼层页码无效。')
   const rows=(await db.collection(C.replies).where({topicId:p.id,floor:db.command.gt(after)}).orderBy('floor','asc').limit(20).get()).data,cache=new Map()
   return {rows:await Promise.all(rows.map(row=>replyDto(row,identity,cache))),afterFloor:after}
  }
  if(action==='forumMyReplies'){const result=await page(C.replies,{ownerOpenId:uid},p.after),cache=new Map();return {rows:await Promise.all(result.rows.map(row=>replyDto(row,identity,cache))),next:result.next}}
  if(action==='forumOwnReply'){const row=await get(db,C.replies,p.id);if(!row||row.ownerOpenId!==uid)fail('只能读取自己的楼层修改记录。');return replyDto(row,identity)}
  if(action==='editForumReply'){
   await requireProfile(uid);const body=clean(p.body,2,1000,'回复正文');await db.runTransaction(async tx=>{const receiptRow=await receipt(tx,uid,action,p);if(receiptRow.old)return;const row=await get(tx,C.replies,p.id);if(!row||row.ownerOpenId!==uid)fail('只能修改自己的楼层。');if(row.version!==Number(p.version))fail('楼层版本已变化，请重新读取。');require('./review-policy.cjs').assertEditable(row,p,fail);await quota(tx,uid,'楼层回复',60);const topic=await get(tx,C.topics,row.topicId);await tx.collection(C.replies).doc(row._id).update({data:{body,status:row.status==='hidden'||!topic||topic.status!=='public'?'hidden':'public',...require('./review-policy.cjs').resubmit(row,Boolean(await adminFor(uid))),version:row.version+1,updatedAt:now()}});await audit(tx,uid,'reply',row._id,row.topicId,'author_edit','作者补充楼层',{body:row.body,version:row.version});await record(tx,uid,receiptRow,{id:row._id})});return replyDto(await get(db,C.replies,p.id),identity)
  }
  if(action==='saveForumTopic'){
   const profile=await requireProfile(uid),title=clean(p.title,2,60,'标题'),body=clean(p.body,2,2000,'话题正文'),images=await photos(uid,p.images||[])
   if(!categories.includes(p.category))fail('请选择话题分类。')
   const id=p.id||hash('forum-topic',uid,req(p.clientRequestId))
   await db.runTransaction(async tx=>{
    const r=await receipt(tx,uid,action,p);if(r.old)return
    const old=await get(tx,C.topics,id)
    if(p.id&&!old)fail('原话题不存在。')
    if(old&&(old.ownerOpenId!==uid||old.status==='withdrawn'))fail('只能修改自己尚未撤回的话题。')
    if(old&&old.version!==Number(p.version))fail('话题已更新，请重新读取后修改。')
    require('./review-policy.cjs').assertEditable(old,p,fail)
    await quota(tx,uid,'发帖或修改',5)
    await set(tx,C.topics,id,{...old,ownerOpenId:uid,title,body,images,category:p.category,hometown:profile.hometown,status:old?.status||'public',reason:old?.reason||'',version:(old?.version||0)+1,replyCount:old?.replyCount||0,sequence:old?.sequence||sequence(),createdAt:old?.createdAt||now(),updatedAt:now(),...require('./review-policy.cjs').resubmit(old,Boolean(await adminFor(uid)))})
    await record(tx,uid,r,{id})
   })
   return topicDto(await get(db,C.topics,id),identity)
  }
  if(action==='saveForumReply'){
   await requireProfile(uid);const body=clean(p.body,2,1000,'回复正文'),id=hash('forum-reply',uid,req(p.clientRequestId));let result
   await db.runTransaction(async tx=>{
    const r=await receipt(tx,uid,action,p);if(r.old){result=r.old;return}
    const topic=await get(tx,C.topics,p.topicId);if(!topic||topic.status!=='public')fail('话题已撤回或隐藏，暂不能继续回复。')
    let parent=null
    if(p.replyTo){parent=await get(tx,C.replies,p.replyTo);if(!parent||parent.topicId!==p.topicId||parent.status!=='public')fail('被回复的楼层不可访问，或不属于该话题。')}
    await quota(tx,uid,'楼层回复',60)
    const floor=(topic.replyCount||0)+1
    await set(tx,C.replies,id,{ownerOpenId:uid,topicId:p.topicId,body,floor,replyToId:parent?._id||'',replyToFloor:parent?.floor||0,status:'public',reason:'',version:1,sequence:sequence(),createdAt:now(),...require('./review-policy.cjs').resubmit(null,Boolean(await adminFor(uid)))})
    await tx.collection(C.topics).doc(topic._id).update({data:{replyCount:floor,lastReplyAt:now(),sequence:sequence()}})
    const recipients=new Set([topic.ownerOpenId,parent?.ownerOpenId].filter(v=>v&&v!==uid))
    for(const recipient of recipients)await notify(tx,recipient,'forum_reply',topic._id,id,floor,'有人回复了「'+topic.title+'」 · 第'+floor+'楼',uid)
    result={id,topicId:p.topicId,floor};await record(tx,uid,r,result)
   })
   return result
  }
  if(action==='withdrawForumTopic'||action==='withdrawForumReply'){
   const name=action==='withdrawForumTopic'?C.topics:C.replies,type=name===C.topics?'topic':'reply'
   return db.runTransaction(async tx=>{const row=await get(tx,name,p.id);if(!row||row.ownerOpenId!==uid)fail('只能撤回自己的内容。');if(row.status==='withdrawn')return {status:'withdrawn'};if(row.version!==Number(p.version))fail('内容已更新，请刷新后撤回。');await tx.collection(name).doc(p.id).update({data:{status:'withdrawn',reason:'作者主动撤回',version:row.version+1,updatedAt:now()}});await audit(tx,uid,type,p.id,type==='topic'?p.id:row.topicId,'withdraw','作者主动撤回',{body:row.body,version:row.version});return {status:'withdrawn'}})
  }
  if(action==='reportForum'){
   await requireProfile(uid);const reason=clean(p.reason,2,300,'举报说明');if(!['topic','reply'].includes(p.target))fail('举报目标无效。')
   let result
   await db.runTransaction(async tx=>{const r=await receipt(tx,uid,action,p);if(r.old){result=r.old;return}
    const target=await get(tx,p.target==='topic'?C.topics:C.replies,p.id);if(!target||target.status!=='public')fail('该内容暂不可举报。');const topic=p.target==='topic'?target:await get(tx,C.topics,target.topicId);if(!topic||topic.status!=='public')fail('该话题暂不可举报。');if(target.ownerOpenId===uid)fail('本人内容可直接修改或撤回，无需举报。');if(target.version!==Number(p.version))fail('内容已更新，请重新查看后举报。')
    const id=hash('forum-report',uid,p.target,p.id,target.version),old=await get(tx,C.reports,id)
    if(old){result={id,status:old.status,alreadyReported:true};await record(tx,uid,r,result);return}
    await quota(tx,uid,'讨论举报',20)
    await set(tx,C.reports,id,{ownerOpenId:uid,target:p.target,targetId:p.id,topicId:topic._id,floor:p.target==='reply'?target.floor:0,snapshot:{title:topic.title,body:target.body,images:p.target==='topic'?target.images||[]:[],version:target.version},reason,status:'pending',read:false,archived:false,resolution:'',sequence:sequence(),createdAt:now()})
    result={id,status:'pending'};await record(tx,uid,r,result)
   });return result
  }
  if(action==='adminForumList'){
   const target=['topic','reply','report'].includes(p.target)?p.target:'topic',name=target==='topic'?C.topics:target==='reply'?C.replies:C.reports,valid=target==='report'?['pending','resolved']:['public','hidden','withdrawn'],status=valid.includes(p.status)?p.status:valid[0]
   const found=p.id?await get(db,name,p.id):null,result=p.id?{rows:found?[found]:[],next:''}:await page(name,{status,...(target==='report'?{archived:db.command.neq(true)}:{})},p.after),cache=new Map()
   return {rows:await Promise.all(result.rows.map(row=>target==='topic'?topicDto(row,identity,cache):target==='reply'?replyDto(row,identity,cache):reportDto(row,identity,cache))),next:result.next}
  }
  if(action==='adminForumStatus'){
   const reason=clean(p.reason,2,120,'处理原因');if(!['topic','reply'].includes(p.target)||!['public','hidden'].includes(p.status))fail('讨论管理操作无效。')
   return db.runTransaction(async tx=>{const r=await receipt(tx,uid,action,p);if(r.old)return r.old;const name=p.target==='topic'?C.topics:C.replies,row=await get(tx,name,p.id);if(!row||row.status==='withdrawn')fail('内容已撤回或不存在，不能恢复。');if(row.version!==Number(p.version))fail('内容版本已变化，请重新查看后处理。');if(row.status===p.status)fail('内容已是这个状态，请刷新。');await tx.collection(name).doc(p.id).update({data:{status:p.status,reason,version:row.version+1,updatedAt:now()}});const topicId=p.target==='topic'?p.id:row.topicId;await audit(tx,uid,p.target,p.id,topicId,p.status==='hidden'?'hide':'restore',reason,{body:row.body,version:row.version});await notify(tx,row.ownerOpenId,'forum_moderation',topicId,p.id+':'+(row.version+1),row.floor,'讨论内容'+(p.status==='hidden'?'已隐藏':'已恢复')+'：'+reason,uid);const result={status:p.status};await record(tx,uid,r,result);return result})
  }
  if(action==='adminForumResolve'){
   const reason=clean(p.reason,2,120,'处理结果')
   return db.runTransaction(async tx=>{const r=await receipt(tx,uid,action,p);if(r.old)return r.old;const row=await get(tx,C.reports,p.id);if(!row)fail('举报不存在。');if(row.status==='resolved')return {status:'resolved'};await tx.collection(C.reports).doc(p.id).update({data:{status:'resolved',resolution:reason,resolvedAt:now()}});await audit(tx,uid,'report',p.id,row.topicId,'resolve',reason,row.snapshot);await notify(tx,row.ownerOpenId,'forum_report',row.topicId,p.id,row.floor,'讨论举报处理结果：'+reason,uid);const result={status:'resolved'};await record(tx,uid,r,result);return result})
  }
  if(action==='adminForumReportAction'){
   if(!['read','delete','clear'].includes(p.operation))fail('举报操作无效。')
   if(p.operation==='clear'){let count=0;for(;;){const rows=(await db.collection(C.reports).where({status:'resolved',read:true,archived:db.command.neq(true)}).limit(100).get()).data;for(const row of rows)await db.collection(C.reports).doc(row._id).update({data:{archived:true}});count+=rows.length;if(rows.length<100)break}return {count}}
   return db.runTransaction(async tx=>{const row=await get(tx,C.reports,p.id);if(!row)fail('举报不存在。');if(p.operation==='delete'&&row.status!=='resolved')fail('请先记录举报处理结果。');await tx.collection(C.reports).doc(p.id).update({data:p.operation==='read'?{read:true}:{archived:true}});return {ok:true}})
  }
  if(action==='forumNotifications'){
   const where={ownerOpenId:uid,archived:false};if(p.phase)where.read=p.phase==='read'
   const result=await page(C.notifications,where,p.after),cache=new Map()
   return {rows:await Promise.all(result.rows.map(async row=>({id:'forum:'+row._id,kind:row.kind,body:row.body,target_id:row.topicId,target_type:'forum',floor:row.floor,read:row.read,created_at:stamp(row.createdAt),actorProfileId:(await author(row.actor,cache)).profileId,actorName:(await author(row.actor,cache)).name}))),next:result.next}
  }
  if(action==='forumNotificationAction'){
   if(!['read','delete','clear'].includes(p.operation))fail('消息操作无效。')
   if(p.operation==='clear'){let count=0;for(;;){const rows=(await db.collection(C.notifications).where({ownerOpenId:uid,read:true,archived:false}).limit(100).get()).data;for(const row of rows)await db.collection(C.notifications).doc(row._id).update({data:{archived:true}});count+=rows.length;if(rows.length<100)break}return {count}}
   return db.runTransaction(async tx=>{const row=await get(tx,C.notifications,p.id);if(!row||row.ownerOpenId!==uid)fail('只能操作自己的消息。');await tx.collection(C.notifications).doc(p.id).update({data:p.operation==='read'?{read:true}:{archived:true}});return {ok:true}})
  }
  if(action==='forumSummary'){const unread=await db.collection(C.notifications).where({ownerOpenId:uid,archived:false,read:false}).count();const pending=identity.admin?await db.collection(C.reports).where({status:'pending'}).count():{total:0};return {unreadCount:unread.total,pendingCount:pending.total}}
  fail('不支持这项讨论操作。')
 }
}
module.exports.actions=ACTIONS
module.exports.publicActions=PUBLIC
module.exports.collections=C
