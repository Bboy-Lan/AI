// Compact level title next to an author. Without `title` the original identity badge is unchanged.
export function RoleBadge({admin=false,owner=false,title=''}:{admin?:boolean,owner?:boolean,title?:string}){
 return <span className="identity-badges">{title
  ? <span className={'level-badge'+(admin?' is-admin':'')} title={title}>{title}</span>
  : <span className={'role-badge'+(admin?' role-badge--admin':'')}>{admin?'♛ 吃货大王':'小吃货'}</span>}
  {owner&&<span className="role-badge role-badge--owner">楼主</span>}</span>
}
