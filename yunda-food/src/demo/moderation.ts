import {REVIEW_KINDS,REVIEW_LABELS,type ReviewKind} from '../domain/moderation'
import type {DemoState} from './fixtures'
export const REVIEW_READS=['adminReviewQueue','adminReviewDetail','adminReviewSummary','reviewNotifications','reviewSummary']
import {reviewTagOf} from '../domain/moderation'
export const REVIEW_ACTIONS=new Set([...REVIEW_READS,'adminReviewApply','adminReviewBatch','adminRejectImage','reviewNotificationAction'])
// The demo must read the same tag rule as the server, or its badges and counts drift from the review desk.
const tag=(r:any)=>reviewTagOf(r)
const token=(r:any)=>{let h=2166136261;for(const c of JSON.stringify(r))h=Math.imul(h^c.charCodeAt(0),16777619);return String(h>>>0)}
export function fillReviewCase(state:DemoState){
 const tags=['pending','approved','changes','blocked','deleted'] as const,sample=state.foods[0],caution=state.cautions[0],topic=state.forum?.topics[0];if(!sample||!caution||!topic)return
 const metadata=(i:number)=>({owner_uid:state.actor,reviewTag:tags[i%5],reviewVersion:i%5?1:0,status:(i%5>=2?'hidden':'public') as 'hidden'|'public',createdAt:'2026-11-08T10:00:00Z',reviewReason:i%5>=2?'演示处理意见：请补充具体事实。':''})
 state.foods=Array.from({length:40},(_,i)=>({...sample,...metadata(i),id:'bulk-food-'+String(i).padStart(3,'0'),name:'审核案例 '+(i+1)+' · 米线与校园窗口',description:'用于集中审核的100条隔离案例；这里只保存本机演示数据。',images:i%3===0?sample.images:[]}))
 state.cautions=Array.from({length:20},(_,i)=>({...caution,...metadata(i),id:'bulk-caution-'+i,name:'【演示】店铺消费记录 '+(i+1),version:1,status:i%5===0?'pending':metadata(i).status as any}))
 state.forum!.topics=Array.from({length:20},(_,i)=>({...topic,...metadata(i),id:'bulk-topic-'+i,title:'校园与同乡讨论 '+(i+1),replyCount:i===0?10:0,version:1}))
 state.reviews=Array.from({length:10},(_,i)=>({id:'bulk-review-'+i,...metadata(i),foodId:state.foods[0].id,author:'演示作者',hometown:'云南省昆明市',rating:4,text:'集中审核评价案例 '+(i+1),ate:true,status:metadata(i).status as any}))
 state.forum!.replies=Array.from({length:10},(_,i)=>({id:'bulk-reply-'+i,...metadata(i),topicId:'bulk-topic-0',body:'集中审核楼层案例 '+(i+1),floor:i+1,version:1}));state.messages=[];state.favorites=[];state.reports=[0,5,10,15].map(i=>({id:'bulk-report-'+i,target_type:'food',target_id:state.foods[i].id,status:'pending',reason:'演示待核实举报',archived:false}));state.forum!.reports=[{id:'bulk-forum-report',target:'topic',targetId:'bulk-topic-0',topicId:'bulk-topic-0',status:'pending',reason:'演示待核实话题举报',snapshot:{title:'校园与同乡讨论 1',body:'仅供演示'},owner_uid:state.actor}]
}
export function demoModeration(state:DemoState,action:string,p:any):any{
 const s=state as any,actor=state.profiles.find(r=>r.uid===state.actor)!,lists:any={food:state.foods,caution:state.cautions,review:state.reviews,topic:state.forum?.topics||[],reply:state.forum?.replies||[]},title=(kind:string,r:any)=>kind==='food'||kind==='caution'?r.name:kind==='review'?state.foods.find(x=>x.id===r.foodId)?.name:kind==='reply'?'第'+r.floor+'楼':r.title,bodyKey=(k:string)=>k==='food'?'description':k==='review'?'text':'body',path=(k:string,r:any)=>k==='food'?'/detail/'+r.id:k==='caution'?'/tree-detail/'+r.id:k==='review'?'/detail/'+r.foodId:'/forum/'+(k==='topic'?r.id:r.topicId)+(k==='reply'?'?floor='+r.floor:''),editPath=(k:string,r:any)=>k==='food'?'/publish/'+r.id:k==='caution'?'/tree-compose/'+r.id:k==='topic'?'/forum-compose/'+r.id:k==='reply'?'/forum-reply-edit/'+r.id:path(k,r)
 const dto=(kind:ReviewKind,r:any,detail=false)=>({kind,id:r.id,version:r.version,title:title(kind,r)||'未命名内容',body:r[bodyKey(kind)]||'',images:r.images||[],status:r.status,category:r.category||'',author:state.profiles.find(p=>p.uid===r.owner_uid)?.display_name||'同学',createdAt:r.createdAt||'2026-11-09',reviewTag:tag(r),reviewVersion:r.reviewVersion||0,adminEdited:!!r.adminEdited,reviewToken:token(r),reviewReason:r.reviewReason||'',path:path(kind,r),editPath:editPath(kind,r),...(detail?{audit:(s.reviewAudit||[]).filter((a:any)=>a.kind===kind&&a.targetId===r.id).slice(-20).reverse()}:{})})
 const get=(k:string,id:string)=>{const row=lists[k]?.find((r:any)=>r.id===id);if(!row)throw Error('内容不存在。');return row}
 if(action.startsWith('admin')&&!actor.isAdmin)throw Error('无管理员权限。')
 // Rejecting a single photo removes it from the demo record and tells the author to upload another one.
 if(action==='adminRejectImage'){
  const kind=String(p.kind||'avatar'),reason=String(p.reason||'').trim(),fileId=String(p.fileId||'')
  if(reason.length<2)throw Error('请填写至少2字的驳回说明。')
  if(kind==='avatar'){
   const owner=state.profiles.find(x=>x.uid===p.id)||state.profiles.find(x=>x.avatar_key===fileId)
   if(!owner||owner.avatar_key!==fileId)throw Error('这张照片已不是当前头像。')
   owner.avatar_key='';owner.avatar_rejected={fileId,reason}
   state.messages.unshift({id:'review:'+crypto.randomUUID(),owner_uid:owner.uid,kind:'content_review',target_type:'review_action',target_id:owner.uid,path:'/me',editPath:'/onboarding',body:'你的头像未通过审核，已移除，请重新上传一张。驳回说明：'+reason,read:false,archived:false,created_at:new Date().toISOString()})
   return {kind:'avatar',id:owner.uid,fileId,remaining:0}
  }
  if(!['food','caution','topic'].includes(kind))throw Error('图片类型无效。')
  const r=get(kind,p.id),images=(r.images||[]) as string[]
  if(!images.includes(fileId))throw Error('这张照片已不在该内容中。')
  r.images=images.filter(value=>value!==fileId)
  r.rejectedImages=[...(r.rejectedImages||[]),{fileId,reason}]
  const routes:any={food:['/detail/','/publish/'],caution:['/tree-detail/','/tree-compose/'],topic:['/forum/','/forum-compose/']}
  state.messages.unshift({id:'review:'+crypto.randomUUID(),owner_uid:r.owner_uid,kind:'content_review',target_type:'review_action',target_id:r.id,path:routes[kind][0]+r.id,editPath:routes[kind][1]+r.id,body:'你的'+({food:'推荐',caution:'消费经历',topic:'话题'} as any)[kind]+'「'+(title(kind,r)||'内容')+'」有 1 张照片未通过审核，已移除，请重新上传。驳回说明：'+reason,read:false,archived:false,created_at:new Date().toISOString()})
  return {kind,id:r.id,fileId,remaining:(r.images||[]).length}
 }
 if(action==='adminReviewQueue'){let rows=Object.entries(lists).flatMap(([kind,list]:any)=>list.map((r:any)=>dto(kind as ReviewKind,r))).filter((r:any)=>(p.kind==='all'||!p.kind||r.kind===p.kind)&&(!p.tag||p.tag==='all'||r.reviewTag===p.tag)&&(!p.reportedOnly||state.reports.some(x=>x.status==='pending'&&!x.archived&&x.target_type===r.kind&&x.target_id===r.id)||(state.forum?.reports||[]).some((x:any)=>x.status==='pending'&&!x.archived&&x.target===r.kind&&x.targetId===r.id))&&(!p.query||[r.title,r.body,r.category].join(' ').toLowerCase().includes(p.query.toLowerCase())));const after=Number(p.after||0);return {rows:rows.slice(after,after+20),next:rows.length>after+20?String(after+20):''}}
 if(action==='adminReviewDetail')return dto(p.kind,get(p.kind,p.id),true)
 if(action==='adminReviewSummary'){const result:any={pending:0,changes:0,blocked:0};for(const rows of Object.values(lists) as any[])for(const r of rows)if(tag(r) in result)result[tag(r)]++;return result}
 if(action==='adminReviewBatch'){if(!Array.isArray(p.items)||!p.items.length||p.items.length>20)throw Error('请选择1～20条。');return {results:p.items.map((item:any)=>{try{return {...demoModeration(state,'adminReviewApply',{...p,...item}),ok:true}}catch(e){return {...item,ok:false,error:(e as Error).message}}})}}
 if(action==='adminReviewApply'){
  if(String(p.reason||'').trim().length<2)throw Error('请填写至少2字的处理意见。');const r=get(p.kind,p.id);if(token(r)!==p.token)throw Error('内容版本已变化，请刷新后重新审核。');if(tag(r)==='withdrawn')throw Error('作者已撤回，不能恢复或编辑。');if(p.action==='deleted'&&!p.confirmDelete)throw Error('请确认软删除。');const before=dto(p.kind,r),edited=p.action==='edit'
  if(edited){if(tag(r)==='deleted')throw Error('已删除内容请先恢复。');const e=p.edit;if(!e||!(String(e.body||'').trim().length>=(p.kind==='review'?0:p.kind==='caution'?10:2)))throw Error('请完整填写正文。');if(!['reply','review'].includes(p.kind)){if(!e.title?.trim())throw Error('请填写标题。');r[p.kind==='topic'?'title':'name']=e.title}if(e.images?.some((x:string)=>!r.images.includes(x)))throw Error('仅能移除或重排原图。');r[bodyKey(p.kind)]=e.body;if(r.images)r.images=e.images;if(['food','topic'].includes(p.kind))r.category=e.category;r.adminEdited=true}else{if(!(p.action in REVIEW_LABELS)||p.action==='withdrawn')throw Error('审核操作无效。');r.reviewTag=p.action;r.status=p.action==='approved'?'public':p.action==='pending'&&tag(before)==='pending'?r.status:'hidden'}
  r.reviewVersion=(r.reviewVersion||0)+1;if(['caution','topic','reply'].includes(p.kind))r.version=(r.version||0)+1;r.reviewReason=p.reason;r.reason=p.reason;r.updatedAt=new Date().toISOString();s.reviewAudit||=[];s.reviewAudit.push({kind:p.kind,targetId:r.id,action:p.action,reason:p.reason,before,after:dto(p.kind,r),createdAt:r.updatedAt});state.messages.unshift({id:'review:'+crypto.randomUUID(),owner_uid:r.owner_uid,kind:'content_review',target_type:'review_action',target_id:r.id,path:path(p.kind,r),editPath:tag(r)==='changes'?editPath(p.kind,r):'',body:'你的'+REVIEW_KINDS[p.kind as ReviewKind]+'「'+title(p.kind,r)+'」'+(edited?'已由管理员编辑':'被标记为「'+REVIEW_LABELS[tag(r) as keyof typeof REVIEW_LABELS]+'」')+'。处理意见：'+p.reason,read:false,archived:false,created_at:r.updatedAt});return {id:r.id,kind:p.kind,tag:tag(r)}
 }
 if(action==='reviewNotifications')return {rows:state.messages.filter(r=>r.owner_uid===state.actor&&!r.archived&&r.kind==='content_review'),next:''}
 if(action==='reviewSummary')return {unreadCount:state.messages.filter(r=>r.owner_uid===state.actor&&!r.archived&&!r.read&&r.kind==='content_review').length}
 if(action==='reviewNotificationAction'){for(const r of state.messages.filter(r=>r.owner_uid===state.actor&&r.kind==='content_review')){if(p.operation==='clear'&&r.read)r.archived=true;else if(r.id==='review:'+p.id){if(p.operation==='read')r.read=true;else if(p.operation==='delete')r.archived=true}}return {ok:true}}
 throw Error('审核接口无效。')
}
