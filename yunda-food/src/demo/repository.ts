import {createDemoState,type DemoCase,type DemoState,type DemoFood,type DemoCaution} from './fixtures'
const READ_ACTIONS=new Set(['context','foods','food','myFoods','myFavorites','myReviews','reviews','cautions','caution','announcement','notificationSummary','publicProfile','adminProfileDetail','messages','feedback','myAppeals','adminFeedback','adminAppeals','adminFoods','adminReviews','adminProfiles','adminCautions','adminReports'])
function validateFood(p:any){
 if(!p.name?.trim()||p.name.length>60||!p.venue?.trim()||p.venue.length>80||!(p.price>0&&p.price<1000)||!p.authorAte)throw Error('请填写名称、地点、有效价格并确认亲自吃过。')
 if(!['正餐','小吃','饮品','甜品'].includes(p.category)||!['inside','outside'].includes(p.locationType)||!['portion','person'].includes(p.priceBasis))throw Error('请选择类别、地点类型和价格口径。')
 const drink=['饮品','甜品'].includes(p.category),taste=p.taste||{},level=drink?taste.sweet:taste.spicy
 if(!Number.isInteger(level)||level<0||level>3)throw Error('请选择明确的'+(drink?'甜度':'辣度')+'。')
 const tags=taste.tags||[]
 if(drink?(taste.spicy!=null||taste.staple||tags.length||!['','冷','热','常温'].includes(taste.temperature||'')):(taste.sweet!=null||taste.temperature||!Array.isArray(tags)||tags.length>2||new Set(tags).size!==tags.length||tags.some((t:string)=>!['正常','清淡','偏咸','偏甜','香辣','酸香','麻香'].includes(t))||tags.includes('正常')&&tags.length>1))throw Error('请选择与类别对应的口味。')
 if(!Array.isArray(p.images)||p.images.length>3)throw Error('照片最多3张。')
}
export function createDemoRepository(initial:DemoState,onChange:(value:DemoState)=>void=()=>{}){
 let state=structuredClone(initial)
 const actor=()=>state.profiles.find(p=>p.uid===state.actor)!
 const admin=()=>{if(!actor().isAdmin)throw Error('无管理员权限。')}
 const active=(publishing=false)=>{const p=actor();if(p.account_status==='banned')throw Error('账号使用已暂停。');if(publishing&&p.publishing_restricted)throw Error('已限制发布，历史投稿仍可补充。')}
 const profileId=(uid:string)=>'demo-profile-'+uid
 const food=(f:DemoFood)=>{const p=state.profiles.find(p=>p.uid===f.owner_uid)!,reviews=state.reviews.filter(r=>r.foodId===f.id&&r.status==='public');return {...f,author:p.display_name,hometown:p.hometown,authorAvatar:p.avatar_key,authorRole:p.isAdmin?'admin':'user',profileId:profileId(p.uid),canEdit:f.owner_uid===state.actor,favorite:state.favorites.includes(f.id),rating:reviews.length?Number((reviews.reduce((sum,r)=>sum+r.rating,0)/reviews.length).toFixed(1)):undefined,ratingCount:reviews.length,verificationPositiveCount:reviews.filter(r=>r.foodVerified).length,verificationNegativeCount:reviews.filter(r=>!r.foodVerified).length}}
 const caution=(c:DemoCaution)=>{const p=state.profiles.find(p=>p.uid===c.owner_uid)!;return {...c,author:p.display_name,hometown:p.hometown,avatarKey:p.avatar_key,profileId:profileId(p.uid),canEdit:p.uid===state.actor,liked:state.liked.includes(c.id)}}
 const id=()=>crypto.randomUUID(),now=()=>new Date().toISOString()
 const byId=(rows:any[],target:string)=>{const row=rows.find(r=>r.id===target);if(!row)throw Error('记录不存在。');return row}
 const feedbackRows=(isAdmin:boolean,appeals=false)=>state.feedback.filter(r=>(r.kind==='appeal')===appeals&&(isAdmin?!r.admin_archived:r.owner_uid===state.actor&&!r.user_archived)).sort((a,b)=>Number(isAdmin?!b.admin_read:!b.user_read)-Number(isAdmin?!a.admin_read:!a.user_read)||b.updated_at.localeCompare(a.updated_at)).map(r=>({...r,author:state.profiles.find(p=>p.uid===r.owner_uid)?.display_name,profileId:profileId(r.owner_uid)}))
 function execute(action:string,p:any):any{
  const target=p.id||p.foodId
  if(action.startsWith('admin'))admin()
  switch(action){
   case 'context':return {uid:state.actor,profileId:profileId(state.actor),profile:actor(),isAdmin:actor().isAdmin,backend:'isolated-demo'}
   case 'foods':return state.foods.filter(f=>f.status==='public').map(food)
   case 'food':{const f=state.foods.find(f=>f.id===target&&(f.status==='public'||f.owner_uid===state.actor||actor().isAdmin));return f?food(f):null}
   case 'myFoods':return state.foods.filter(f=>f.owner_uid===state.actor).map(food)
   case 'myFavorites':return state.foods.filter(f=>state.favorites.includes(f.id)&&f.status==='public').map(food)
   case 'myReviews':return state.reviews.filter(r=>r.owner_uid===state.actor).map(r=>({...r,food_id:r.foodId,item_name:state.foods.find(f=>f.id===r.foodId)?.name,body:r.text}))
   case 'reviews':return state.reviews.filter(r=>r.foodId===target&&(r.status==='public'||actor().isAdmin)).map(r=>({...r,own:r.owner_uid===state.actor,profileId:profileId(r.owner_uid),authorRole:state.profiles.find(p=>p.uid===r.owner_uid)?.isAdmin?'admin':'user'}))
   case 'cautions':return state.cautions.filter(c=>p.mine?c.owner_uid===state.actor:c.status==='public').map(caution)
   case 'caution':{const c=state.cautions.find(c=>c.id===target&&(c.status==='public'||c.owner_uid===state.actor||actor().isAdmin));return c?caution(c):null}
   case 'announcement':return state.announcement
   case 'ackAnnouncement':if(p.version!==state.announcement.version)throw Error('公告已有更新。');state.announcement.acknowledged=true;break
   case 'notificationSummary':return {unreadCount:state.messages.filter(m=>m.owner_uid===state.actor&&!m.read&&!m.archived).length+state.feedback.filter(r=>r.owner_uid===state.actor&&!r.user_read&&!r.user_archived).length,pendingCount:actor().isAdmin?state.cautions.filter(c=>c.status==='pending').length+state.reports.filter(r=>r.status==='pending').length+state.feedback.filter(r=>!r.admin_read&&!r.admin_archived).length:0}
   case 'saveProfile':if(!p.name?.trim()||!p.hometown||!p.avatarKey)throw Error('请完整填写头像、昵称和家乡。');Object.assign(actor(),{display_name:p.name,hometown:p.hometown,avatar_key:p.avatarKey});break
   case 'publicProfile':{const f=state.foods.find(f=>f.id===target),r=state.reviews.find(r=>r.id===target),c=state.cautions.find(c=>c.id===target);const uid=target?.startsWith('demo-profile-')?target.slice(13):f?.owner_uid||r?.owner_uid||c?.owner_uid;const user=state.profiles.find(p=>p.uid===uid);return user?{profile:{name:user.display_name,hometown:user.hometown,avatarKey:user.avatar_key,isAdmin:user.isAdmin},foods:state.foods.filter(f=>f.owner_uid===uid&&f.status==='public').map(food)}:null}
   case 'adminProfileDetail':{const uid=target.startsWith('demo-profile-')?target.slice(13):state.foods.find(f=>f.id===target)?.owner_uid||state.reviews.find(r=>r.id===target)?.owner_uid||target;return {profile:state.profiles.find(p=>p.uid===uid),foods:state.foods.filter(f=>f.owner_uid===uid).map(food)}}
   case 'saveFood':{active(!target);const old=state.foods.find(f=>f.id===target);if(old&&old.owner_uid!==state.actor)throw Error('只能编辑自己的推荐。');validateFood(p);const next={...old,...p,id:old?.id||id(),owner_uid:state.actor,status:old?.status||'public',createdAt:old?.createdAt||now(),updatedAt:now()};state.foods=[next,...state.foods.filter(f=>f.id!==next.id)];return food(next)}
   case 'favorite':{active();const f=byId(state.foods,target);if(f.status!=='public')throw Error('该推荐不可收藏。');const desired=p.favorite??!state.favorites.includes(target);state.favorites=state.favorites.filter(v=>v!==target);if(desired)state.favorites.push(target);return food(f)}
   case 'saveReview':{active(true);const f=byId(state.foods,target);if(f.owner_uid===state.actor)throw Error('投稿人不能给自己的推荐评分。');if(f.status!=='public'||!p.ate||!Number.isInteger(p.rating)||p.rating<1||p.rating>5||String(p.text||'').length>300)throw Error('请确认亲自吃过，并选择1～5分。');const old=state.reviews.find(r=>r.foodId===target&&r.owner_uid===state.actor);state.reviews=state.reviews.filter(r=>r!==old);state.reviews.push({...p,id:old?.id||id(),foodId:target,owner_uid:state.actor,author:actor().display_name,hometown:actor().hometown,status:'public',createdAt:now()});break}
   case 'saveCaution':{active(true);const old=state.cautions.find(c=>c.id===target);if(old&&(old.owner_uid!==state.actor||old.version!==p.version))throw Error('经历版本已变化或不属于你。');if(!p.confirmed||!p.name?.trim()||!p.address?.trim()||String(p.body||'').length<10||p.tags.length<1||p.tags.length>3)throw Error('请填写完整经历并确认亲自消费。');const next={...old,...p,id:old?.id||id(),owner_uid:state.actor,status:'pending',reason:'',version:(old?.version||0)+1,createdAt:old?.createdAt||now(),updatedAt:now(),sequence:String(state.cautions.length+1).padStart(16,'0')};state.cautions=state.cautions.filter(c=>c!==old).concat(next);return {id:next.id,status:next.status}}
   case 'withdrawCaution':{const c=byId(state.cautions,target);if(c.owner_uid!==state.actor||c.version!==p.version)throw Error('只能撤回自己的当前版本经历。');c.status='withdrawn';c.version++;break}
   case 'likeCaution':{active(true);const c=byId(state.cautions,target);if(c.status!=='public')throw Error('该经历不可点赞。');const had=state.liked.includes(target);state.liked=state.liked.filter(v=>v!==target);if(p.liked)state.liked.push(target);c.likes+=had===p.liked?0:p.liked?1:-1;break}
   case 'saveIssue':case 'reportCaution':{active(true);if(String(p.reason||'').trim().length<2)throw Error('请说明举报原因。');const row=byId(action==='saveIssue'?state.foods:state.cautions,target);state.reports.push({id:id(),target_id:target,target_type:action==='saveIssue'?'food':'caution',kind:p.type||'content_report',reason:p.reason,status:'pending',read:false,archived:false,snapshot:structuredClone(row),created_at:now()});break}
   case 'messages':return state.messages.filter(r=>r.owner_uid===state.actor&&!r.archived).sort((a,b)=>Number(a.read)-Number(b.read)||b.created_at.localeCompare(a.created_at))
   case 'messageAction':for(const m of state.messages.filter(m=>m.owner_uid===state.actor)){if(p.operation==='clear'&&m.read)m.archived=true;else if(m.id===target){if(p.operation==='read')m.read=true;else if(p.operation==='delete')m.archived=true}}break
   case 'feedback':return feedbackRows(false)
   case 'myAppeals':return feedbackRows(false,true)
   case 'adminFeedback':return feedbackRows(true)
   case 'adminAppeals':return feedbackRows(true,true)
   case 'saveFeedback':case 'saveAppeal':{if(action==='saveFeedback'&&actor().isAdmin)throw Error('管理员请查看和回复用户反馈。');if(String(p.body||'').trim().length<2||p.body.length>500)throw Error('请填写2～500字。');const next={id:id(),owner_uid:state.actor,kind:action==='saveAppeal'?'appeal':p.type,body:p.body,admin_read:false,user_read:true,admin_archived:false,user_archived:false,created_at:now(),updated_at:now(),replies:[],...(action==='saveAppeal'?{appeal_status:'pending'}:{})};state.feedback.unshift(next);return {id:next.id}}
   case 'replyFeedback':{const row=byId(state.feedback,target);if(!actor().isAdmin&&row.owner_uid!==state.actor)throw Error('无权回复。');if(String(p.body||'').trim().length<2||p.body.length>500||row.replies.length>=20)throw Error('回复需2～500字，本条最多20条回复。');row.replies.push({admin:actor().isAdmin,body:p.body,createdAt:now()});row.admin_read=actor().isAdmin;row.user_read=!actor().isAdmin;row.admin_archived=false;row.user_archived=false;row.updated_at=now();break}
   case 'feedbackAction':case 'adminFeedbackAction':{const isAdmin=action.startsWith('admin'),read=isAdmin?'admin_read':'user_read',archived=isAdmin?'admin_archived':'user_archived';for(const row of state.feedback.filter(r=>r.kind!=='appeal'&&(isAdmin||r.owner_uid===state.actor))){if(p.operation==='clear'){if(row[read]&&(isAdmin||row.admin_read))row[archived]=true}else if(row.id===target){row[read]=true;if(p.operation==='delete')row[archived]=true}}break}
   case 'adminFoods':return state.foods.map(food)
   case 'adminReviews':return state.reviews.map(r=>({...r,food_id:r.foodId,body:r.text,item_name:byId(state.foods,r.foodId).name,author:state.profiles.find(p=>p.uid===r.owner_uid)?.display_name,profileId:profileId(r.owner_uid)}))
   case 'adminProfiles':return state.profiles.map(p=>({...p,id:p.uid}))
   case 'adminCautions':return state.cautions.map(caution)
   case 'adminReports':return state.reports.filter(r=>!r.archived).sort((a,b)=>Number(b.status==='pending')-Number(a.status==='pending'))
   case 'adminFoodStatus':case 'adminReviewStatus':case 'adminCautionStatus':{if(String(p.reason||'').trim().length<2)throw Error('请填写至少2个字的原因。');const rows=action==='adminFoodStatus'?state.foods:action==='adminReviewStatus'?state.reviews:state.cautions,row=byId(rows,target);if(action==='adminCautionStatus'){if(row.version!==p.version)throw Error('经历版本已变化。');row.version++}row.status=p.status;row.reason=p.reason;state.messages.unshift({id:id(),owner_uid:row.owner_uid,kind:action==='adminCautionStatus'?'caution':'moderation',target_id:target,linked_id:row.foodId||target,body:p.reason,read:false,archived:false,created_at:now()});break}
   case 'adminAccountStatus':{const user=state.profiles.find(u=>u.uid===target)!;if(user.isAdmin)throw Error('不能限制管理员。');if(String(p.reason||'').trim().length<2)throw Error('请填写处理原因。');if(p.status==='restricted'){user.publishing_restricted=true;user.publishing_reason=p.reason;user.account_status='restricted'}else if(p.status==='unrestrict'){user.publishing_restricted=false;user.account_status=user.account_status==='banned'?'banned':'active'}else user.account_status=p.status;user.moderation_reason=p.reason;break}
   case 'adminResolveReport':{if(String(p.reason||'').trim().length<2)throw Error('请填写处理说明。');Object.assign(byId(state.reports,target),{status:'resolved',resolution:p.reason,read:true});break}
   case 'adminReportAction':for(const r of state.reports){if(r.id===target&&p.operation==='read')r.read=true;else if(r.status==='resolved'&&(r.id===target&&p.operation==='delete'||p.operation==='clear'&&r.read))r.archived=true}break
   case 'adminResolveAppeal':{const row=byId(state.feedback,target);if(String(p.reason||'').trim().length<2)throw Error('请填写处理说明。');row.appeal_status=p.status;row.admin_read=true;row.user_read=false;row.replies.push({admin:true,body:p.reason,createdAt:now()});if(p.status==='approve'){const user=state.profiles.find(u=>u.uid===row.owner_uid)!;user.account_status='active';user.publishing_restricted=false}break}
   case 'adminSaveAnnouncement':{const body=String(p.body||'').trim();if(!p.title?.trim()||p.title.length>20||body.length<10||[...body].length>260||body.split('\n').filter(Boolean).length>6)throw Error('标题限20字，正文10～260字、最多6段。');if(p.baseVersion!==state.announcement.version)throw Error('公告已有新版本。');const changed=p.title!==state.announcement.title||body!==state.announcement.body;if(changed)state.announcement={title:p.title,body,version:id(),acknowledged:false};return {ok:true,changed}}
   case 'updateFoodLocation':{active();const f=byId(state.foods,target);if(f.owner_uid!==state.actor)throw Error('只能修改自己的地图位置。');if(f.latitude!==p.expected.latitude||f.longitude!==p.expected.longitude||(f.mapName||'')!==p.expected.mapName)throw Error('地图位置已被修改。');Object.assign(f,{latitude:p.latitude,longitude:p.longitude,mapName:p.mapName,updatedAt:now()});return food(f)}
   default:throw Error('此演示不支持该操作。')
  }
  return {ok:true}
 }
 return {snapshot:()=>structuredClone(state),rpc<T=unknown>(action:string,payload:Record<string,any>={}):T{
  const request=payload.clientRequestId||payload.requestId,key=request?state.actor+':'+action+':'+request:'';const serialized=JSON.stringify(payload)
  const idempotent=['saveFood','saveCaution','saveFeedback','saveAppeal','replyFeedback','reportCaution','saveIssue','updateFoodLocation'].includes(action)
  if(idempotent&&key&&state.requests[key]){if(state.requests[key].payload!==serialized)throw Error('提交编号与内容不匹配。');return structuredClone(state.requests[key].result) as T}
  const previous=structuredClone(state)
  try{const result=execute(action,payload);if(idempotent&&key)state.requests[key]={payload:serialized,result:structuredClone(result)};if(!READ_ACTIONS.has(action))onChange(state);return structuredClone(result) as T}catch(error){state=previous;throw error}
 }}
}
export function loadDemoRepository(scenario:DemoCase,storage:Pick<Storage,'getItem'|'setItem'>){
 const key='xsyj-demo:v1:'+scenario;let data:DemoState=createDemoState(scenario)
 try{const stored=JSON.parse(storage.getItem(key)||'null');if(stored?.schema===1&&stored.actor===data.actor)data=stored}catch{}
 return createDemoRepository(data,state=>storage.setItem(key,JSON.stringify(state)))
}
