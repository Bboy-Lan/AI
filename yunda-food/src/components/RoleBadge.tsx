import {useState,type MouseEvent,type KeyboardEvent} from 'react'
import {createPortal} from 'react-dom'
import {LEVELS,tierOfTitle,quotaView,chinaDay,activityLevel} from '../domain/daily-level'
import {LevelPage} from './LevelPage'

// The administrator is the highest identity and always shows 「吃货大王」, never a level title.
// Other users get a tier badge whose style becomes more prestigious with each level. When the
// owner's growth points and streak are available the badge is tappable and opens that user's level
// status (so classmates can view each other's upgrade progress).
export function RoleBadge({admin=false,owner=false,title='',exp,streak}:{admin?:boolean,owner?:boolean,title?:string,exp?:number,streak?:number}){
  const hasLevel=typeof exp==='number'&&typeof streak==='number'
  const label=title||(hasLevel?activityLevel(streak,exp).title:LEVELS[0].title)
  const tier=tierOfTitle(label)
  const [open,setOpen]=useState(false)
  const clickable=!admin&&hasLevel
  const openSheet=(e:MouseEvent<HTMLSpanElement>)=>{e.stopPropagation();e.preventDefault();setOpen(true)}
  const onKey=(e:KeyboardEvent<HTMLSpanElement>)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();setOpen(true)}}
  const badgeProps=clickable
    ? {role:'button' as const,tabIndex:0,'aria-haspopup':'dialog' as const,'aria-label':'查看 '+label+' 的等级',onClick:openSheet,onKeyDown:onKey,className:'level-badge is-clickable tier-'+tier}
    : {className:'level-badge '+(admin?'tier-admin':'tier-'+tier)}
  return <span className="identity-badges">
    <span {...badgeProps} title={admin?'吃货大王 · 最高身份':label}>{admin?<><i className="crown">♛</i>吃货大王</>:label}</span>
    {owner&&<span className="role-badge role-badge--owner">楼主</span>}
    {open&&clickable&&createPortal(<LevelPage level={quotaView({activityStreak:streak,activityExp:exp},chinaDay(),0)} isAdmin={false} onClose={()=>setOpen(false)}/>,document.body)}
  </span>
}
