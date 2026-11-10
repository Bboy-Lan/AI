import {checkSessionError} from '../platform/session-errors'
import type cloudbase from '@cloudbase/js-sdk'
import {isDemo,demoCase,demoActor} from '../demo/mode'
import {prepareImage} from './image'
import type {ImagePurpose} from '../domain/image-policy'
let demoRepository:ReturnType<typeof import('../demo/repository').loadDemoRepository>|undefined
async function demo(){if(!demoRepository){const {loadDemoRepository}=await import('../demo/repository');demoRepository=loadDemoRepository(demoCase!,localStorage)}return demoRepository}
export const cloudEnabled=isDemo||Boolean(import.meta.env?.VITE_CLOUDBASE_ENV_ID)
export const classicBackend=import.meta.env?.VITE_CLOUDBASE_BACKEND==='classic'
type Client=ReturnType<typeof cloudbase.init>
type Auth=ReturnType<Client['auth']>
export let cloud:Client|null=null
let actualAuth:Auth|null=null,clientPromise:Promise<Client>|undefined
const authObservers=new Map<(...args:any[])=>void,any>()
async function client():Promise<Client>{
 if(cloud)return cloud
 if(!clientPromise)clientPromise=(async()=>{let timer:ReturnType<typeof setTimeout>|undefined;try{const sdk=await Promise.race([import('@cloudbase/js-sdk'),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('登录组件加载超时，请检查网络后重试。')),15000)})]);cloud=sdk.default.init({env:import.meta.env.VITE_CLOUDBASE_ENV_ID,region:import.meta.env.VITE_CLOUDBASE_REGION,persistence:'local',accessKey:import.meta.env.VITE_CLOUDBASE_PUBLISHABLE_KEY,auth:{detectSessionInUrl:true}});actualAuth=cloud.auth();for(const callback of authObservers.keys())authObservers.set(callback,actualAuth.onAuthStateChange(callback));return cloud}catch(e){clientPromise=undefined;throw e}finally{clearTimeout(timer)}})()
 return clientPromise
}
function possibleSession(){if(cloud)return true;try{if(/[?&#](access_token|refresh_token|token_hash|auth_code|code)=/.test(location.search+location.hash))return true;return !!localStorage.getItem('credentials_'+import.meta.env.VITE_CLOUDBASE_ENV_ID)}catch{return false}}
// Defer the large authentication SDK until a saved session or an explicit account action needs it.
export const cloudAuth=cloudEnabled&&!isDemo?new Proxy({} as Auth,{get:(_target,key)=>{
 if(key==='then')return undefined
 if(key==='onAuthStateChange')return (callback:(...args:any[])=>void)=>{authObservers.set(callback,actualAuth?.onAuthStateChange(callback));return {data:{subscription:{unsubscribe(){authObservers.get(callback)?.data?.subscription?.unsubscribe();authObservers.delete(callback)}}}}}
 return (...args:any[])=>client().then(()=>{const method=(actualAuth as any)[key];return method.apply(actualAuth,args)})
}}):null
export type CloudProfile={display_name:string,hometown:string,avatar_key:string,avatar_rejected?:{fileId:string,reason:string}|null,preferences:Record<string,unknown>,account_status:string,moderation_reason:string,publishing_restricted?:boolean,publishing_reason?:string}
export type CloudContext={profileId?:string,uid:string|null,isAdmin:boolean,profile:CloudProfile|null}
let guestLogin:Promise<void>|undefined
const reads=new Set(['forumOwnReply','adminReviewQueue','adminReviewDetail','adminReviewSummary','reviewNotifications','reviewSummary','forumTopics','forumTopic','forumReplies','forumMyReplies','adminForumList','forumNotifications','forumSummary','context','foods','food','reviews','myFoods','myFavorites','myReviews','cautions','caution','announcements','adminNotices','announcement','notificationSummary','publicProfile','adminProfileDetail','messages','feedback','myAppeals','adminFeedback','adminAppeals','adminFoods','adminReviews','adminProfiles','adminCautions','adminReports','mediaUrl','mediaUploadPath'])
function completed<T>(action:string,data:T){if(!reads.has(action)&&typeof window!=='undefined')window.dispatchEvent(new Event('xsyj:data-changed'));return data}
async function ensureClassicTransport(){
 if(!cloudAuth)return
 const result=await cloudAuth.getSession()
 checkSessionError(result.error)
 if(result.data?.session)return
 if(!guestLogin)guestLogin=cloudAuth.signInAnonymously().then(r=>{if(r.error)throw Error(r.error.message)}).finally(()=>{guestLogin=undefined})
 await guestLogin
}
export async function rpc<T=unknown>(action:string,payload:object={}):Promise<T>{
 if(isDemo)return completed(action,await (await demo()).rpc<T>(action,payload))
 if(!cloudEnabled)throw Error('尚未配置云环境。')
 if(classicBackend){
  await ensureClassicTransport()
  const response=await (await client()).callFunction({name:'xsyj_web_v1',data:{action,payload}})
  const result=response.result as {ok:boolean,data:T,message?:string}
  if(!result?.ok)throw Error(result?.message||'云端操作未成功，请保留输入后重试。')
  return completed(action,result.data)
 }
 // Installed SDK 3.11 exposes a MySQL rdb client without PG RPC. Use the
 // documented PG REST RPC endpoint until the SDK provides the PG surface.
 const session=await activeSession()
 const functionName=action==='notificationSummary'?'xsyj_notification_summary':'xsyj_rpc'
 const response=await fetch(`https://${import.meta.env.VITE_CLOUDBASE_ENV_ID}.api.tcloudbasegateway.com/v1/rdb/rest/rpc/${functionName}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session?.access_token||import.meta.env.VITE_CLOUDBASE_PUBLISHABLE_KEY}`},body:JSON.stringify(action==='notificationSummary'?{}:{action,payload})})
 const data=await response.json()
 if(!response.ok)throw Error(data.message||data.error_description||'云端操作未成功，请保留输入后重试。')
 return completed(action,data as T)
}
export async function activeSession(){if(isDemo)return {access_token:'demo-only-no-cloud-access',user:{id:demoActor,is_anonymous:false}};if(!possibleSession())return null;const response=await cloudAuth?.getSession();checkSessionError(response?.error);return response&&!response.error&&response.data.session&&!response.data.session.user?.is_anonymous?response.data.session:null}
export async function login(username:string,password:string){
 if(isDemo)throw Error('演示案例无需登录，可在上方切换身份。')
 if(!cloudAuth)throw Error('尚未配置身份认证。')
 const result=await cloudAuth.signInWithPassword(username.includes('@')?{email:username,password}:{username,password})
 if(result.error)throw Error(result.error.message)
 if(!result.data.session)throw Error('尚未取得登录会话。')
}
export async function uploadImage(file:File,purpose:ImagePurpose='photo'){
 // Every entry point shares one pipeline: HEIC/HEIF decode, orientation, per-purpose sizing, encoding fallback.
 const prepared=await prepareImage(file,purpose)
 const name=String(file.name||'photo').replace(/\.[^.]+$/,'')+'.'+prepared.extension
 const processed=new File([prepared.blob],name,{type:prepared.type})
 if(isDemo){
  if(prepared.bytes>2*1024*1024)throw Error('演示案例照片处理后仍超过2MB，请换一张更小的图片；演示只保存在本机。')
  return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('图片读取失败。'));reader.readAsDataURL(processed)})
 }
 const session=await activeSession();if(!session)throw Error('请先登录后上传图片。');const storageClient=await client()
 const extension=prepared.extension
 if(classicBackend){
  const {path}=await rpc<{path:string}>('mediaUploadPath',{extension})
  const result=await storageClient.uploadFile({cloudPath:path,filePath:processed})
  if(!result.fileID)throw Error('照片上传未完成，请重试。')
  return result.fileID
 }
 const key=`${session.user.id}/${crypto.randomUUID()}.${extension}`
 const {error}=await storageClient.storage.from('xsyj-media').upload(key,processed,{contentType:prepared.type,upsert:false})
 if(error)throw Error(error.message)
 return key
}
const mediaCache=new Map<string,{expires:number,value:Promise<string>}>()
export async function mediaUrl(key:string){
 if(!cloudEnabled||!key||key.startsWith('/')||key.startsWith('blob:')||key.startsWith('https:')||key.startsWith('data:image/'))return key
 const existing=mediaCache.get(key)
 if(existing&&existing.expires>Date.now())return existing.value
 const entry={expires:Date.now()+240000,value:fetchMediaUrl(key)}
 mediaCache.set(key,entry)
 if(mediaCache.size>256)mediaCache.delete(mediaCache.keys().next().value!)
 try{return await entry.value}catch(e){if(mediaCache.get(key)===entry)mediaCache.delete(key);throw e}
}
async function fetchMediaUrl(key:string){
 if(!cloudEnabled)return key
 if(classicBackend){
  return rpc<string>('mediaUrl',{key})
 }
 const {data,error}=await (await client()).storage.from('xsyj-media').createSignedUrl(key,1800)
 if(error)throw Error(error.message)
 return data?.fullSignedURL||''
}
