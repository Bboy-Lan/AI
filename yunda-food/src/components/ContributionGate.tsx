import {useEffect,type ReactNode} from 'react'
import {Account,ProfileEditor} from '../pages/CloudPages'
import {repository} from '../services/repository'
import {BackButton} from './BackButton'
export function ContributionGate({children}:{children:ReactNode}){
 const {uid,profile}=repository.context,complete=Boolean(profile?.display_name&&profile.avatar_key&&profile.hometown),here=location.hash
 useEffect(()=>{if(!uid||!complete)sessionStorage.setItem('xsyj-return',here)},[uid,complete,here])
 if(!uid)return <Account/>
 if(!complete)return <ProfileEditor/>
 if(profile?.publishing_restricted)return <main className="page"><BackButton onClick={()=>history.back()}/><h1>暂时不能发布</h1><p className="notice">{profile.publishing_reason||'账号当前被限制发布内容。'}</p><button className="button secondary" onClick={()=>{location.hash='/blocked'}}>查看原因与申请复核</button></main>
 return children
}
