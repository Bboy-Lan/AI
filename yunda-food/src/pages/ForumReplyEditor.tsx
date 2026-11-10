import {useEffect,useState} from 'react'
import {BackButton} from '../components/BackButton'
import {ReviewBadge} from '../components/ReviewBadge'
import {rpc} from '../services/cloud'
import type {ForumReply} from '../domain/forum'
export function ForumReplyEditor({id}:{id:string}){
 const [row,setRow]=useState<ForumReply>(),[body,setBody]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[request,setRequest]=useState(()=>crypto.randomUUID())
 useEffect(()=>{let live=true;rpc<ForumReply>('forumOwnReply',{id}).then(r=>{if(live){setRow(r);setBody(r.body)}}).catch(e=>setError(e.message));return()=>{live=false}},[id])
 const back=()=>{location.hash=row&&!row.topicUnavailable?'/forum/'+row.topicId+'?floor='+row.floor:'/treehole?tab=forum'}
 if(!row)return <main className="page form-page"><BackButton onClick={back}/><p className="empty">{error||'正在读取自己的楼层…'}</p></main>
 return <main className="page form-page"><BackButton onClick={back}/><p className="eyebrow">保留原楼层，补充具体事实</p><h1>修改第{row.floor}楼</h1><p>{row.topicTitle}</p><ReviewBadge item={row} visible/>{row.reason&&<p className="notice">处理意见：{row.reason}</p>}{['deleted','withdrawn'].includes(row.reviewTag||row.status)?<p className="notice">已删除或撤回内容不能修改。</p>:<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await rpc('editForumReply',{id,body:body.trim(),version:row.version,reviewVersion:row.reviewVersion,clientRequestId:request});back()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}><label>回复正文 <i>必填</i><textarea aria-label="修改楼层正文" required minLength={2} maxLength={1000} value={body} disabled={busy} onChange={e=>{setBody(e.target.value);setRequest(crypto.randomUUID())}}/></label><p className="muted">保存后进入待审核；已隐藏内容保持不公开，楼层号不变。</p><button className="button primary" disabled={busy}>{busy?'正在保存…':'提交楼层修改'}</button></form>}{error&&<p role="alert" className="notice">{error}</p>}</main>
}
