import {integerPrice} from './price-step'
// Ported from the frozen mini-program services/discovery.js and detail-presentation.js.
// Web persistence and the SQL field names are adapted at this boundary only.
import {same,label} from './hometown'
import type {Food} from '../services/local-repository'
export const CATEGORIES=['全部','正餐','小吃','饮品','甜品']
export const SPICY_LABELS=['不辣','微辣','中辣','爆辣']
export const SWEET_LABELS=['无糖或不甜','少甜','正常甜','偏甜']
export const TAG_OPTIONS=['正常','清淡','偏咸','偏甜','香辣']
export const READABLE_TAGS=[...TAG_OPTIONS,'酸香','麻香']
export const STAPLES=['米饭','面食','米线','非主食']
export type Taste={spicy?:number|null,sweet?:number|null,tags?:string[],staple?:string,temperature?:string}
export type Preferences={hometown:string,spicy:number|null,tags:string[],staple:string,budget:string}
export type Filters={keyword?:string,locationType?:string,place?:string,category?:string,spicy?:number|null,sweet?:number|null,budget?:string|number,people?:number,hometownOnly?:boolean}
export const numeric=(value:unknown):number|null=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value))?Number(value):null
export const level=(value:unknown)=>{const n=numeric(value);return n!=null&&Number.isInteger(n)&&n>=0&&n<=3?n:null}
export const isDrink=(category:string)=>['饮品','甜品'].includes(category)
export function toggleTag(current:string[],value:string){if(!TAG_OPTIONS.includes(value))return current;const tags=current.filter(t=>TAG_OPTIONS.includes(t));return tags.includes(value)?tags.filter(t=>t!==value):value==='正常'?['正常']:tags.filter(t=>t!=='正常').concat(value).slice(-2)}
export function preferences(owner:string|null,hometown=''):Preferences{
 let saved:Partial<Preferences>={};try{saved=JSON.parse(localStorage.getItem('xsyj-preferences:'+(owner||'guest'))||'{}')}catch{}
 return {hometown:saved.hometown||hometown,spicy:level(saved.spicy),tags:Array.isArray(saved.tags)?saved.tags.filter(t=>READABLE_TAGS.includes(t)).slice(0,2):[],staple:saved.staple||'',budget:saved.budget||''}
}
export function savePreferences(owner:string|null,value:Preferences){localStorage.setItem('xsyj-preferences:'+(owner||'guest'),JSON.stringify(value))}
export function normalize(food:Food){
 const taste=food.taste||{},drink=isDrink(food.category)
 const spicyLabel=food.spicy==='很辣'?'爆辣':food.spicy||''
 const spicy=drink?null:level(taste.spicy??(SPICY_LABELS.includes(spicyLabel)?SPICY_LABELS.indexOf(spicyLabel):null))
 const legacySweet:Record<string,number>={'无糖':0,'少糖':1,'较甜':3}
 const sweet=drink?level(taste.sweet??legacySweet[food.sweet||'']):null
 const tags=Array.isArray(taste.tags)?taste.tags.filter(t=>READABLE_TAGS.includes(t)).slice(0,2):food.tags.filter(t=>READABLE_TAGS.includes(t)).slice(0,2)
 const price=numeric(food.price)
 const places=food.locationType==='inside'?[food.school,food.campus,food.venue]:[food.region,food.venue,food.addressSummary]
 return {...food,price:integerPrice(price??undefined),taste:{spicy,sweet,tags,staple:taste.staple||'',temperature:taste.temperature||''},placeText:places.filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' · ')||food.placeText||'地点未标注',tasteText:[spicy==null?'':SPICY_LABELS[spicy],sweet==null?'':SWEET_LABELS[sweet],...tags,taste.temperature].filter(Boolean).join(' · ')||'口味未标注'}
}
// One rule for "why this recommendation fits you": the home list only ranks with it, the detail page shows it.
export function reasonItems(item:Food,prefs:Partial<Preferences>={}):string[]{
 const hometown=same(prefs.hometown,item.hometown),spicy=item.taste?item.taste.spicy:null,compatible=prefs.spicy!=null&&spicy!=null&&spicy<=Number(prefs.spicy),shared=(item.taste&&item.taste.tags||[]).filter(t=>(prefs.tags||[]).includes(t)),staple=Boolean(prefs.staple&&item.taste&&prefs.staple===item.taste.staple)
 return [hometown?'同乡推荐（家乡自填）':'',compatible?`${SPICY_LABELS[spicy!]}在你的接受范围`:'',shared.length?shared.join('、')+'符合你偏好':'',staple?'你常吃的'+item.taste!.staple:''].filter(Boolean) as string[]
}
export function matchScore(item:Food,prefs:Partial<Preferences>={}):number{
 const hometown=same(prefs.hometown,item.hometown),spicy=item.taste?item.taste.spicy:null,compatible=prefs.spicy!=null&&spicy!=null&&spicy<=Number(prefs.spicy),shared=(item.taste&&item.taste.tags||[]).filter(t=>(prefs.tags||[]).includes(t)),staple=Boolean(prefs.staple&&item.taste&&prefs.staple===item.taste.staple)
 return (hometown?10:0)+(compatible?1:0)+shared.length+(staple?1:0)
}
export function filterItems(items:Food[],filters:Filters={},prefs:Partial<Preferences>={}){
 const words=String(filters.keyword||'').trim().toLowerCase(),budget=numeric(filters.budget),people=Number(filters.people)>0?Number(filters.people):1
 return items.map(normalize).filter(item=>{
  if(item.status&&item.status!=='public')return false
  if(words&&![item.storeName,item.name,item.venue,item.placeText].join(' ').toLowerCase().includes(words))return false
  if(filters.locationType&&filters.locationType!=='all'&&item.locationType!==filters.locationType)return false
  if(filters.place&&![item.school,item.campus,item.region,item.venue,item.addressSummary,item.placeText,item.address].join(' ').includes(filters.place))return false
  if(filters.category&&filters.category!=='全部'&&item.category!==filters.category)return false
  if(filters.spicy!=null&&item.taste.spicy!==Number(filters.spicy))return false
  if(filters.sweet!=null&&item.taste.sweet!==Number(filters.sweet))return false
  if(budget!=null&&(!['portion','person'].includes(item.priceBasis||'')||item.price==null||item.price<=0||item.price*people>budget))return false
  return !filters.hometownOnly||same(prefs.hometown,item.hometown)
 }).map(item=>{
  const reasons=reasonItems(item,prefs)
  return {...item,sameHometown:same(prefs.hometown,item.hometown),reasons:reasons.join(' · '),orderScore:matchScore(item,prefs)}
 }).sort((a,b)=>b.orderScore-a.orderScore)
}
// 排布方式：默认沿用匹配度（同乡/口味相近的靠前），另提供点赞、时间、评分三种客观排序。
export type SortMode='recommend'|'likes'|'newest'|'rating'
export const SORT_OPTIONS:[SortMode,string][]=[['recommend','推荐顺序'],['likes','点赞最多'],['newest','最新发布'],['rating','评分最高']]
export const SORT_LABELS:Record<SortMode,string>={recommend:'推荐顺序',likes:'点赞最多',newest:'最新发布',rating:'评分最高'}
const publishedTime=(item:Food)=>{
 const raw=(item as {createdAt?:unknown,updatedAt?:unknown}).createdAt??(item as {updatedAt?:unknown}).updatedAt
 if(raw==null)return 0
 if(typeof raw==='object'){const object=raw as {$date?:string|number,_seconds?:number};const value=object.$date??(object._seconds!=null?object._seconds*1000:null);return value==null?0:new Date(value).getTime()||0}
 const time=new Date(raw as string|number).getTime();return Number.isFinite(time)?time:0
}
const likeCount=(item:Food)=>Math.max(0,Number(item.likeCount)||0)
const ratingValue=(item:Food)=>{const rating=Number(item.rating);return Number.isFinite(rating)&&rating>0?rating:0}
const ratingCount=(item:Food)=>Math.max(0,Number(item.ratingCount)||0)
// 稳定排序：同分时按发布时间新的靠前，再保持传入顺序，避免每次渲染顺序跳动。
export function sortFoods(items:Food[],mode:SortMode='recommend'):Food[]{
 if(mode==='recommend'||!items.length)return items
 const compared=items.map((item,index)=>({item,index}))
 const timeOf=(row:{item:Food})=>publishedTime(row.item)
 compared.sort((a,b)=>{
  const tie=()=>timeOf(b)-timeOf(a)||a.index-b.index
  if(mode==='likes')return likeCount(b.item)-likeCount(a.item)||tie()
  if(mode==='newest')return timeOf(b)-timeOf(a)||a.index-b.index
  // 评分：有评价的排在没有评分的之前，同分看人数，再看点赞。
  const rated=Number(ratingCount(b.item)>0)-Number(ratingCount(a.item)>0)
  return rated||ratingValue(b.item)-ratingValue(a.item)||ratingCount(b.item)-ratingCount(a.item)||likeCount(b.item)-likeCount(a.item)||tie()
 })
 return compared.map(row=>row.item)
}
export function dateLabel(value:unknown):string{
 if(!value)return ''
 if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value
 const object=value as {$date?:string|number,_seconds?:number}
 const raw=typeof value==='object'?object.$date??(object._seconds!=null?object._seconds*1000:null):value
 if(raw==null)return ''
 const date=new Date(raw as string|number);return Number.isFinite(date.getTime())?new Date(date.getTime()+8*3600000).toISOString().slice(0,10):''
}
export const chinaDay=()=>dateLabel(Date.now())
export const hometownLabel=label
