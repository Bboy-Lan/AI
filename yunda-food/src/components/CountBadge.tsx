// One red numeric badge for users and administrators: unread messages, pending review, unfinished work.
// A zero count renders nothing, so no surface has to guard the boundary itself.
export function CountBadge({count,label='待处理',className=''}:{count:number,label?:string,className?:string}){
 const value=Math.max(0,Math.floor(Number(count)||0))
 if(!value)return null
 return <span className={'count-badge'+(className?' '+className:'')} role="status" aria-label={label+' '+value+' 条'}>{value>99?'99+':value}</span>
}
