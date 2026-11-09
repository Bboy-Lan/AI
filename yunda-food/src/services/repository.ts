import {restoreIdentity} from '../platform/identity-bootstrap'
import type {Notice} from '../domain/notices'
import {repository as local} from './local-repository'
import type {Food,Review,Caution} from './local-repository'
import {activeSession,cloudEnabled,mediaUrl,rpc,type CloudContext} from './cloud'
import {normalize} from '../domain/discovery'
import {createRefreshGate} from '../platform/refresh-gate'
export type {Food,Review,Caution} from './local-repository'
let foods:Food[]=[],cautions:Caution[]=[],reviews:Record<string,Review[]>={}
const pendingLocations=new Map<string,string>()
const decorateFood=async(food:Food):Promise<Food>=>({...normalize(food),mediaKeys:food.images,images:await Promise.all(food.images.map(mediaUrl))})
export const repository={
 mode:cloudEnabled?'cloud':'local',
 context:{uid:null,isAdmin:false,profile:null} as CloudContext,
 unreadCount:0,pendingCount:0,cautionHasMore:false,mineCautionHasMore:false,
 announcements:[] as Notice[],
 announcement:null as null|{version:string,title?:string,body?:string,acknowledged?:boolean,updatedAt?:string},
 mine:[] as Food[],favorites:[] as Food[],ownReviews:[] as Record<string,unknown>[],mineCautions:[] as Caution[],
 invalidate(){refresh.invalidate()},
 load({maxAge=0}:{maxAge?:number}={}){return refresh.load(maxAge)},
 async refreshData(){
  if(!cloudEnabled)return
  let restoredSession:Awaited<ReturnType<typeof activeSession>>=null;
  const context=await restoreIdentity(async()=>{restoredSession=await activeSession();return restoredSession},()=>rpc<CloudContext>('context'),{uid:null,isAdmin:false,profile:null} as CloudContext)
  this.context=restoredSession?context:{uid:null,isAdmin:false,profile:null};
  if(!restoredSession||!context.profile?.display_name||!context.profile.avatar_key||!context.profile.hometown||context.profile.account_status==='banned'){this.announcements=[];this.announcement=null;this.unreadCount=0;this.pendingCount=0;foods=[];cautions=[];this.mine=[];this.favorites=[];this.ownReviews=[];this.mineCautions=[];return}
  const [rows,posts,announcement]=await Promise.all([rpc<Food[]>('foods'),rpc<Caution[]>('cautions'),rpc<Notice[]>('announcements')])
  const session=restoredSession
  this.context=session?context:{uid:null,isAdmin:false,profile:null};this.announcements=announcement;this.announcement=announcement.find(n=>n.kind==='basic')||null
  if(session){const summary=await rpc<{unreadCount:number,pendingCount:number}>('notificationSummary');this.unreadCount=summary.unreadCount;this.pendingCount=summary.pendingCount}else{this.unreadCount=0;this.pendingCount=0}
  this.cautionHasMore=posts.length===20;foods=await Promise.all(rows.map(decorateFood));cautions=await Promise.all(posts.map(async p=>({...p,mediaKeys:p.images,images:await Promise.all(p.images.map(mediaUrl))})))
  if(session&&context.profile&&context.profile.account_status!=='banned'){
   const [mine,favorites,own]=await Promise.all([rpc<Food[]>('myFoods'),rpc<Food[]>('myFavorites'),rpc<Record<string,unknown>[]>('myReviews')])
   this.mine=await Promise.all(mine.map(decorateFood));this.favorites=await Promise.all(favorites.map(decorateFood));this.ownReviews=own
   const ownPosts=await rpc<Caution[]>('cautions',{mine:true});this.mineCautionHasMore=ownPosts.length===20;this.mineCautions=await Promise.all(ownPosts.map(async p=>({...p,mediaKeys:p.images,images:await Promise.all(p.images.map(mediaUrl))})))
  }else {this.mine=[];this.favorites=[];this.ownReviews=[];this.mineCautions=[]}
 },
 foods:()=>cloudEnabled?foods:local.foods(),
 cautions:()=>cloudEnabled?[...new Map([...cautions,...repository.mineCautions].map(p=>[p.id,p])).values()]:local.cautions(),
 reviews:(id:string)=>cloudEnabled?reviews[id]||[]:local.reviews(id),
 async loadDetail(id:string){
  if(!cloudEnabled)return this.foods().find(x=>x.id===id)
  const [row,items]=await Promise.all([rpc<Food|null>('food',{id}),rpc<Review[]>('reviews',{id})]);reviews[id]=items
  if(!row)return undefined
  const food=await decorateFood(row);foods=[food,...foods.filter(x=>x.id!==id)];return food
 },
 async saveFood(food:Food){
  if(!cloudEnabled)return local.saveFood(food)
  const exists=foods.some(x=>x.id===food.id)||this.mine.some(x=>x.id===food.id)
  const saved=await rpc<Food>('saveFood',{...food,id:exists?food.id:undefined,images:food.mediaKeys||food.images})
  const result=await decorateFood(saved);foods=[result,...foods.filter(x=>x.id!==result.id)];return result
 },
 async toggleFavorite(id:string){if(!cloudEnabled)return local.toggleFavorite(id);const saved=await decorateFood(await rpc<Food>('favorite',{id,favorite:!foods.find(x=>x.id===id)?.favorite}));foods=foods.map(x=>x.id===id?saved:x);return saved},
 async saveReview(review:Review){if(!cloudEnabled)return local.saveReview(review);await rpc('saveReview',{...review,id:review.foodId});await this.loadDetail(review.foodId);return review},
 async saveIssue(foodId:string,type:'price_report'|'content_report',reason:string){if(!cloudEnabled)return local.saveIssue(foodId,type,reason);await rpc('saveIssue',{id:foodId,type,reason})},
 async saveCaution(post:Caution){if(!cloudEnabled)return local.saveCaution(post);return rpc<{id:string,status:string}>('saveCaution',{...post,id:cautions.some(x=>x.id===post.id)?post.id:undefined})},
 async moreCautions(mine=false){const list=mine?this.mineCautions:cautions;const after=(list.at(-1) as Caution&{sequence?:string})?.sequence;const rows=await rpc<Caution[]>('cautions',{mine,after});const decorated=await Promise.all(rows.map(async p=>({...p,mediaKeys:p.images,images:await Promise.all(p.images.map(mediaUrl))})));const merged=[...new Map([...list,...decorated].map(p=>[p.id,p])).values()];if(mine){this.mineCautions=merged;this.mineCautionHasMore=rows.length===20}else{cautions=merged;this.cautionHasMore=rows.length===20}},
 async loadCaution(id:string){const post=await rpc<Caution|null>('caution',{id});if(!post)return undefined;const decorated={...post,mediaKeys:post.images,images:await Promise.all(post.images.map(mediaUrl))};cautions=[decorated,...cautions.filter(p=>p.id!==id)];return decorated},
 async setFoodStatus(id:string,status:string,reason:string){await rpc('adminFoodStatus',{id,status,reason});return this.loadDetail(id)},
 async updateLocation(food:Food,point:{latitude:number,longitude:number,mapName:string}){
  const expected={latitude:food.latitude??null,longitude:food.longitude??null,mapName:food.mapName||'',locationAddress:food.locationAddress||''},signature=JSON.stringify([food.id,point,expected])
  const clientRequestId=pendingLocations.get(signature)||crypto.randomUUID();pendingLocations.set(signature,clientRequestId)
  const result=await decorateFood(await rpc<Food>('updateFoodLocation',{id:food.id,reviewVersion:food.reviewVersion,...point,expected,clientRequestId}));pendingLocations.delete(signature);foods=foods.map(f=>f.id===result.id?result:f);return result
 },
}
const refresh=createRefreshGate(()=>repository.refreshData())
