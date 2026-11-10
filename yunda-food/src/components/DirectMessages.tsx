import {useEffect,useRef,useState} from 'react'
import {rpc} from '../services/cloud'
import {repository} from '../services/repository'
import {dateLabel} from '../domain/discovery'
import {MediaImage} from '../pages/CloudPages'

export type DirectMessage={id:string,body:string,fromAdmin:boolean,read:boolean,createdAt:string}
type DirectThread={profileId:string,name:string,avatar:string,lastBody:string,lastAt:string,unread:number}
const summary=async()=>{const count=await rpc<{unreadCount:number,pendingCount:number}>('notificationSummary');repository.unreadCount=count.unreadCount;repository.pendingCount=count.pendingCount}

// 管理员可以主动发起私信；用户只能读取自己那条对话并回复，不能新建对话。
export function DirectMessages({profileId:initial=''}:{profileId?:string}){
 const isAdmin=repository.context.isAdmin
 const [threads,setThreads]=useState<DirectThread[]>([]),[active,setActive]=useState(initial),[messages,setMessages]=useState<DirectMessage[]>([]),[text,setText]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[request,setRequest]=useState(()=>crypto.randomUUID())
 const tail=useRef<HTMLDivElement>(null)
 const openThread=async(profileId:string,silent=false)=>{
  if(!profileId)return
  if(!silent)setLoading(true)
  setActive(profileId);setError('')
  try{
   const data=await rpc<{messages:DirectMessage[]}>('adminDirectThread',{profileId})
   if(data.messages.some(m=>!m.read)){await rpc('readDirectMessages',{profileId});await summary();setThreads(prev=>prev.map(t=>t.profileId===profileId?{...t,unread:0}:t))}
   setMessages(data.messages.map(m=>({...m,read:true})))
  }catch(e){setError((e as Error).message)}finally{if(!silent)setLoading(false)}
 }
 const loadThreads=async(pick='',silent=false)=>{
  try{
   const rows=await rpc<DirectThread[]>('adminDirectThreads')
   setThreads(rows)
   const next=pick||active||initial||rows[0]?.profileId||''
   if(next)await openThread(next,silent);else if(!silent)setLoading(false)
  }catch(e){setError((e as Error).message);if(!silent)setLoading(false)}
 }
 const loadMine=async(silent=false)=>{
  try{
   const rows=await rpc<DirectMessage[]>('myDirectMessages')
   if(rows.some(m=>!m.read)){await rpc('readDirectMessages',{});await summary()}
   setMessages(rows.map(m=>({...m,read:true})))
  }catch(e){setError((e as Error).message)}finally{if(!silent)setLoading(false)}
 }
 useEffect(()=>{setLoading(true);if(isAdmin)void loadThreads();else void loadMine()},[isAdmin])
 useEffect(()=>{const timer=setInterval(()=>{if(document.hidden||busy)return;if(isAdmin)void loadThreads(active,true);else void loadMine(true)},15000);return()=>clearInterval(timer)},[isAdmin,busy,active])
 useEffect(()=>{tail.current?.scrollIntoView({block:'nearest'})},[messages.length])
 if(!repository.context.uid)return null
 const mine=(m:DirectMessage)=>isAdmin?m.fromAdmin:!m.fromAdmin
 const send=async()=>{
  const body=text.trim()
  if(body.length<2){setError('请填写至少2个字的内容。');return}
  if(isAdmin&&!active){setError('请先选择一位用户。');return}
  setBusy(true);setError('')
  try{
   await rpc(isAdmin&&!messages.length?'sendDirectMessage':'replyDirectMessage',isAdmin?{profileId:active,body,clientRequestId:request}:{body,clientRequestId:request})
   setText('');setRequest(crypto.randomUUID())
   if(isAdmin)await loadThreads(active);else await loadMine()
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 const bubbles=<div className="dm-thread-list">{(messages.length?messages.map(m=><p key={m.id} className={'dm-bubble'+(mine(m)?' me':'')}><span>{m.body}</span><small>{m.fromAdmin?'管理员':'我'} · {dateLabel(m.createdAt)}</small></p>):[<div className="empty" key="empty">{isAdmin?'还没有消息，发出第一条私信吧。':'管理员还没有给你发过私信。'}</div>])}<div ref={tail}/></div>
 const composer=<form className="dm-composer" onSubmit={e=>{e.preventDefault();void send()}}><textarea value={text} maxLength={300} minLength={2} required onChange={e=>setText(e.target.value)} placeholder={isAdmin?'写一条私信，对方会在互动消息里看到':'回复管理员'} disabled={busy}/><button className="button primary" disabled={busy||(isAdmin&&!active)}>{busy?'正在发送…':'发送'}</button></form>
 if(!isAdmin)return <section className="card dm-panel"><h3>管理员私信</h3><p className="muted">只有管理员可以主动发起私信。这里显示管理员发给你的消息，你可以直接回复。</p>{error&&<p role="alert" className="notice">{error}</p>}{loading?<div className="empty">正在读取私信…</div>:bubbles}{!loading&&messages.length>0&&composer}</section>
 const thread=threads.find(t=>t.profileId===active)
 const picker=<div className="dm-threads">{threads.length?threads.map(row=><button type="button" key={row.profileId} className={'dm-thread'+(row.profileId===active?' active':'')} onClick={()=>void openThread(row.profileId)}><span className="dm-avatar">{row.avatar?<MediaImage src={row.avatar} alt={row.name}/>:<span>食</span>}</span><span className="dm-thread-body"><b>{row.name}</b><small>{row.lastBody}</small></span>{row.unread>0&&<i className="dm-unread">{row.unread>99?'99+':row.unread}</i>}</button>):<div className="empty">还没有用户回复过私信。可在「用户治理 → 用户」里点开一位同学后发起私信。</div>}</div>
 return <section className="card dm-panel"><h3>{active?thread?.name||'这位用户':'选择一位用户'}{active&&<button className="link" onClick={()=>{location.hash='/user/'+active}}>查看主页 →</button>}</h3>{error&&<p role="alert" className="notice">{error}</p>}{picker}{loading?<div className="empty">正在读取对话…</div>:active?<>{bubbles}{composer}</>:<div className="empty">从上面的列表里选择一位用户。</div>}</section>
}
