import {LEVELS,tierOfTitle} from '../domain/daily-level'

// The administrator is the highest identity and always shows 「吃货大王」, never a level title.
// Other users get a tier badge whose style becomes more prestigious with each level.
export function RoleBadge({admin=false,owner=false,title=''}:{admin?:boolean,owner?:boolean,title?:string}){
 const tier=tierOfTitle(title)
 return <span className="identity-badges">{admin
  ? <span className="level-badge tier-admin" title="吃货大王 · 最高身份">♛ 吃货大王</span>
  : <span className={'level-badge tier-'+tier} title={title||LEVELS[0].title}>{title||LEVELS[0].title}</span>}
  {owner&&<span className="role-badge role-badge--owner">楼主</span>}</span>
}
