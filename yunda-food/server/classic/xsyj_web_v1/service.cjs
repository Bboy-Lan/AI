const crypto=require('node:crypto')
const stamp=v=>v?new Date(v.$date||v).toISOString():undefined
const status=v=>({published:'public',rejected:'returned'}[v]||v)
const fail=message=>{const e=Error(message);e.publicMessage=message;throw e}
const publicActions=new Set(['context','foods','food','reviews','cautions','caution','announcement','publicProfile','mediaUrl'])
module.exports=function createService({dispatch,dependencies:d,cautions:c}){
 return async function service(identity,action,p={}){
  if(typeof action!=='string'||!p||typeof p!=='object'||Array.isArray(p))fail('业务请求无效。')
  const uid=identity.uid&&!identity.isAnonymous?identity.uid:''
  if(!publicActions.has(action)&&!uid||action==='cautions'&&p.mine&&!uid)fail('请先登录网页账号。')
  const [self,admin]=await Promise.all([uid?d.profileFor(uid):null,uid?d.adminFor(uid):null])
  if(action.startsWith('admin')&&!admin)fail('无管理员权限。')
  if(self?.accountStatus==='banned'&&!['context','feedback','myAppeals','saveFeedback','saveAppeal','replyFeedback','feedbackAction','announcement'].includes(action))fail('当前账号已被封禁，请申请复核。')
  const f=(a,payload={})=>dispatch(uid,a,payload)
  const profiles=new Map(),getProfile=owner=>{if(!profiles.has(owner))profiles.set(owner,d.profileFor(owner));return profiles.get(owner)}
  const profile=row=>row?{uid:row._id,display_name:row.foodieId,hometown:row.hometown,avatar_key:row.avatarFileId||'',preferences:{},account_status:row.accountStatus||'active',moderation_reason:row.banReason||'',publishing_restricted:row.moderationStatus==='restricted',publishing_reason:row.moderationReason||'',isAdmin:!!row.isAdmin}:null
  let favorites
  const food=async row=>{if(!row)return null;if(!favorites)favorites=new Set(uid?await f('getFavoriteIds'):[]);const author=row.ownerOpenId?await getProfile(row.ownerOpenId):null;return {id:row._id,name:row.name,category:row.category,price:row.price,priceBasis:row.priceBasis,locationType:row.locationType||'inside',school:row.school||'',campus:row.campus||'',region:row.region||'',venue:row.venue||'',placeText:[row.locationType==='outside'?row.region:row.school,row.locationType==='outside'?'':row.campus,row.venue,row.addressSummary].filter(Boolean).join(' · '),author:author?.foodieId||row.authorNickname||'吃货同学',hometown:author?.hometown||row.authorHometown||'',profileId:author?._id,authorAvatar:author?.avatarFileId||row.authorAvatarFileId||'',authorRole:row.authorRole||'user',authorAte:row.authorAte,taste:row.taste,tags:row.taste?.tags||[],address:row.addressSummary||'',addressSummary:row.addressSummary||'',mapName:row.locationName||'',locationAddress:row.locationAddress||'',latitude:row.latitude,longitude:row.longitude,description:row.description||'',images:row.imageFileIds||[],favorite:favorites.has(row._id),rating:row.ratingAverage||0,ratingCount:row.ratingCount||0,verificationPositiveCount:row.verificationPositiveCount||0,verificationNegativeCount:row.verificationNegativeCount||0,status:status(row.status),reason:row.hiddenReason||'',canEdit:!!uid&&row.ownerOpenId===uid,createdAt:stamp(row.submittedAt),updatedAt:stamp(row.contentUpdatedAt||row.updatedAt||row.submittedAt)}}
  const foods=rows=>Promise.all(rows.map(food))
  const review=row=>({id:row._id,foodId:row.itemId,food_id:row.itemId,item_name:row.itemName,author:row.authorNickname||'吃货同学',hometown:row.authorHometown||'',avatarKey:row.authorAvatarFileId||'',profileId:row.profileId||row._id,rating:row.rating,text:row.text||'',body:row.text||'',foodVerified:!!row.foodVerified,ate:true,status:status(row.status),reason:row.moderationReason||'',own:row.own===true||row.ownerOpenId===uid,createdAt:stamp(row.updatedAt||row.createdAt)||row.ateDate})
  const caution=row=>({id:row.id,name:row.name,address:row.address,date:row.occurredOn,body:row.body,tags:row.tags||[],images:row.imageFileIds||[],status:status(row.status),version:row.version,sequence:row.sequence,likes:row.likeCount||0,liked:!!row.liked,canEdit:!!row.own,confirmed:true,reason:row.reason||'',author:row.author?.nickname||'吃货同学',hometown:row.author?.hometown||'',profileId:row.author?.profileId,avatarKey:row.author?.avatar||'',createdAt:stamp(row.createdAt),updatedAt:stamp(row.updatedAt)})
  const feedback=row=>({id:row._id,kind:row.category||'解禁申请',body:row.content,admin_read:row.readState==='read',user_read:!row.userUnread,author:row.authorNickname,profileId:row.profileId,created_at:stamp(row.createdAt),updated_at:stamp(row.lastActivityAt||row.createdAt),target:row.target,appeal_status:{approved:'approve',rejected:'reject'}[row.appealStatus]||row.appealStatus,replies:(row.replies||[]).map(r=>({admin:r.role==='admin',body:r.content,createdAt:stamp(r.createdAt)}))})
  const mediaPrefix='xsyj-media/'+d.hash(uid)+'/'
  const assertMedia=images=>{if(!Array.isArray(images)||images.length>3||images.some(x=>typeof x!=='string'||!x.startsWith('cloud://cloud-yunda-d5gxrar1s14b2ee0d.')||!x.includes('/'+mediaPrefix)||x.includes('..')))fail('请使用本人在当前网页上传的照片。')}
  switch(action){
   case 'context':return {uid:uid||null,isAdmin:!!admin,profileId:self?._id,profile:profile(self)}
   case 'foods':return foods(await f('listPublishedItems'))
   case 'food':return food(await f('getItem',{id:p.id}))
   case 'myFoods':return foods(await f('myItems'))
   case 'myFavorites':return foods((await f('myFavoriteItems')).items)
   case 'myReviews':return (await f('myReviews')).map(review)
   case 'reviews':return (await f('listReviews',{itemId:p.id})).map(review)
   case 'saveProfile':assertMedia([p.avatarKey]);await f('saveProfile',{foodieId:p.name,hometown:p.hometown,avatarFileId:p.avatarKey});return {ok:true}
   case 'mediaUploadPath':if(!['jpg','png','webp'].includes(p.extension))fail('照片格式不支持。');return {path:mediaPrefix+crypto.randomUUID()+'.'+p.extension}
   case 'mediaUrl':{const file=p.key;if(typeof file!=='string'||!file.startsWith('cloud://cloud-yunda-d5gxrar1s14b2ee0d.')||!file.includes('/xsyj-media/')||file.includes('..'))fail('照片标识无效。');let allowed=!!admin||!!uid&&file.includes('/'+mediaPrefix);if(!allowed){const results=await Promise.all([d.db.collection('xsyj_food_items').where({status:'published',imageFileIds:file}).limit(1).get(),d.db.collection('xsyj_caution_posts').where({status:'published',imageFileIds:file}).limit(1).get(),d.db.collection('xsyj_profiles').where({avatarFileId:file}).limit(1).get()]);allowed=results.some(r=>r.data.length>0)}if(!allowed)fail('这张照片暂不可访问。');return d.mediaUrl(file)}
   case 'saveFood':{assertMedia(p.images||[]);const result=await f(p.id?'updateItem':'submitItem',{...p,itemSchemaVersion:2,imageFileIds:p.images||[],locationName:p.mapName||''});return food(result)}
   case 'favorite':{if(typeof p.favorite!=='boolean')fail('收藏状态无效。');await d.requireProfile(uid);const target=await f('getItem',{id:p.id});if(!target||target.status!=='published')fail('该投稿暂不可收藏。');const key=d.hash('favorite',uid,p.id);await d.db.runTransaction(async tx=>{const ref=tx.collection('xsyj_favorites').doc(key),itemRef=tx.collection('xsyj_food_items').doc(p.id);const item=await itemRef.get().then(r=>r.data);if(!item||item.status!=='published')fail('该投稿暂不可收藏。');const old=await ref.get().then(r=>r.data).catch(()=>null);if(Boolean(old)===p.favorite)return;if(p.favorite)await ref.set({data:{ownerOpenId:uid,itemId:p.id,createdAt:d.now()}});else await ref.remove();await itemRef.update({data:{favoriteCount:Math.max(0,(item.favoriteCount||0)+(p.favorite?1:-1))}})});favorites=undefined;return food(await f('getItem',{id:p.id}))}
   case 'saveReview':return f('upsertReview',{...p,itemId:p.id})
   case 'saveIssue':return f('submitIssue',{...p,itemId:p.id})
   case 'updateFoodLocation':await f('updateItemLocation',{...p,locationName:p.mapName||'',expected:{...p.expected,locationName:p.expected?.mapName||''}});return food(await f('getItem',{id:p.id}))
   case 'publicProfile':{let target={profileId:p.id};const direct=await d.db.collection('xsyj_profiles').doc(p.id).get().then(r=>r.data).catch(()=>null);if(!direct){const item=await f('getItem',{id:p.id});target=item?{itemId:p.id}:{reviewId:p.id}}const r=await f('getPublicProfile',target);return {profile:{id:r.profile._id,name:r.profile.foodieId,hometown:r.profile.hometown,avatarKey:r.profile.avatarFileId,isAdmin:r.profile.isAdmin},foods:await foods(r.items)}}
   case 'announcement':{const r=await f('getAnnouncement');return {version:r.announcement.version,title:r.announcement.title,body:r.announcement.content,acknowledged:r.acknowledged,updatedAt:stamp(r.announcement.updatedAt)}}
   case 'ackAnnouncement':return f('acknowledgeAnnouncement',p)
   case 'adminSaveAnnouncement':return f('adminSaveAnnouncement',{...p,content:p.body})
   case 'feedback':case 'adminFeedback':return (await f(action==='feedback'?'myFeedback':'adminListFeedback')).map(feedback)
   case 'saveFeedback':return f('submitFeedback',{category:p.type,content:p.body,clientRequestId:p.clientRequestId})
   case 'replyFeedback':return f('replyFeedback',{feedbackId:p.id,content:p.body,clientRequestId:p.clientRequestId})
   case 'feedbackAction':case 'adminFeedbackAction':if(action==='feedbackAction'&&admin||action==='adminFeedbackAction'&&!admin)fail('反馈角色无效。');if(!['clear','read','delete'].includes(p.operation))fail('操作无效。');return f(p.operation==='clear'?'clearReadFeedback':p.operation==='delete'?'archiveFeedback':admin?'adminReadFeedback':'readFeedbackReply',{feedbackId:p.id})
   case 'myAppeals':case 'adminAppeals':return (await f(action==='myAppeals'?'myAccountAppeals':'adminListAccountAppeals')).map(feedback)
   case 'saveAppeal':return f('submitAccountAppeal',{...p,content:p.body})
   case 'adminResolveAppeal':return f('adminResolveAccountAppeal',{appealId:p.id,decision:p.status==='approve'?'approved':'rejected',reason:p.reason})
   case 'adminFoods':return foods(await f('adminListItems'))
   case 'adminReviews':return (await f('adminListReviews')).map(review)
   case 'adminProfiles':return (await f('adminListProfiles')).map(profile)
   case 'adminProfileDetail':{let target={profileId:p.id};const direct=await d.db.collection('xsyj_profiles').doc(p.id).get().then(r=>r.data).catch(()=>null);if(!direct)target=await f('getItem',{id:p.id})?{itemId:p.id}:{reviewId:p.id};const r=await f('adminGetProfileDetail',target);return {profile:profile(r.profile),foods:await foods(r.items)}}
   case 'adminAccountStatus':if(!['banned','active','restricted','unrestrict'].includes(p.status))fail('账号操作无效。');return f(['banned','active'].includes(p.status)?'adminSetAccountBan':'adminSetProfileModeration',{profileId:p.id,reason:p.reason,banned:p.status==='banned',restricted:p.status==='restricted'})
   case 'adminFoodStatus':if(!['public','hidden'].includes(p.status))fail('投稿状态无效。');return f('adminSetItemVisibility',{itemId:p.id,hidden:p.status==='hidden',reason:p.reason})
   case 'adminReviewStatus':if(!['public','hidden'].includes(p.status))fail('评价状态无效。');return f('adminSetReviewVisibility',{reviewId:p.id,hidden:p.status==='hidden',reason:p.reason})
   case 'cautions':return (await c.cautionList(uid,p)).rows.map(caution)
   case 'caution':{const r=await c.cautionGet(uid,p);return caution({...r.post,liked:r.liked})}
   case 'saveCaution':{assertMedia(p.images||[]);const r=await c.cautionSave(uid,{...p,occurredOn:p.date,imageFileIds:p.images||[]});return {id:r.post.id,status:status(r.post.status)}}
   case 'likeCaution':return c.cautionLike(uid,p)
   case 'reportCaution':return c.cautionReport(uid,{...p,target:'post'})
   case 'withdrawCaution':return c.cautionWithdraw(uid,p)
   case 'adminCautionStatus':{const actions={public:'approve',returned:'reject',hidden:'hide'};if(!actions[p.status])fail('审核状态无效。');if(p.status==='public'){const row=(await c.cautionGet(uid,p)).post;if(row.status==='hidden')return c.cautionModerate(uid,{...p,action:'restore',target:'post'})}return c.cautionModerate(uid,{...p,action:actions[p.status],target:'post'})}
   case 'adminCautions':{const rows=await d.db.collection('xsyj_caution_posts').orderBy('sequence','desc').limit(100).get();return Promise.all(rows.data.map(async row=>caution((await c.cautionGet(uid,{id:row._id})).post)))}
   case 'messages':{const [interactions,unread,read]=await Promise.all([f('listMyInteractions'),c.cautionMessages(uid,{phase:'unread'}),c.cautionMessages(uid,{phase:'read'})]);return [...interactions.map(r=>({id:r._id,kind:r.kind==='review'?'interaction':r.kind,body:r.content,target_id:r.itemId,read:r.read,created_at:stamp(r.createdAt),actorProfileId:r.actorProfileId,actorName:r.actorName})),...unread.rows.concat(read.rows).map(r=>({id:'caution:'+r.id,kind:'caution',body:r.body,target_id:r.postId,read:r.read,created_at:stamp(r.createdAt)}))].sort((a,b)=>Number(a.read)-Number(b.read)||String(b.created_at).localeCompare(String(a.created_at)))}
   case 'messageAction':if(p.id?.startsWith('caution:'))return c.cautionMessageAction(uid,{id:p.id.slice(8),action:p.operation});if(p.operation==='clear'){await c.cautionMessageAction(uid,{action:'clear'});return f('clearReadInteractions')}return f(p.operation==='delete'?'deleteInteraction':'readInteraction',{notificationId:p.id})
   case 'adminReports':{const [issues,report]=await Promise.all([f('adminListIssues'),c.cautionQueue(uid,{type:'reports'})]);return [...issues.map(r=>({id:r._id,kind:r.type,reason:r.reason,body:r.content,target_id:r.itemId,target_type:'food',status:r.status,read:!!r.read,resolution:r.resolutionReason,created_at:stamp(r.createdAt),snapshot:r.snapshot})),...report.rows.map(r=>({id:'caution:'+r.id,kind:'content_report',reason:r.reason,target_id:r.postId,target_type:'caution',status:r.status,created_at:stamp(r.createdAt),snapshot:{...r.snapshot,images:r.snapshot.imageFileIds}}))]}
   case 'adminResolveReport':return p.id?.startsWith('caution:')?c.cautionModerate(uid,{id:p.id.slice(8),target:'report',action:'resolve',reason:p.reason}):f('adminResolveIssue',{issueId:p.id,reason:p.reason})
   case 'adminReportAction':if(p.id?.startsWith('caution:'))fail('避雷举报请先记录处理结果。');return f(p.operation==='clear'?'adminClearReadIssues':p.operation==='delete'?'adminArchiveIssue':'adminReadIssue',{issueId:p.id})
   case 'notificationSummary':{const [i,feedbackSummary,cautionSummary,issues]=await Promise.all([f('myInteractionSummary'),f(admin?'adminFeedbackSummary':'feedbackReplySummary'),c.cautionSummary(uid),admin?f('adminIssueSummary'):{}]);return {unreadCount:(i.unreadCount||0)+(admin?0:feedbackSummary.unreadCount||0)+(cautionSummary.unreadCount||0),pendingCount:admin?(feedbackSummary.unreadCount||0)+(issues.unreadCount||0)+(cautionSummary.pendingCount||0):0}}
   default:fail('不支持的业务请求。')
  }
 }
}
