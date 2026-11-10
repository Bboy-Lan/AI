import {REVIEW_LABELS,reviewTagOf,type ReviewFields} from '../domain/moderation'
// Public content never carries an "已审核" badge; other states are only shown to the author or an admin.
// The review desk is an admin-only surface, so it opts into showApproved to read the true state.
export function ReviewBadge({item,overlay=false,visible=true,showApproved=false}:{item:ReviewFields&{status?:string},overlay?:boolean,visible?:boolean,showApproved?:boolean}){
 const tag=reviewTagOf(item)
 if(!visible)return null
 if(tag==='approved'&&!showApproved)return null
 return <span className={'review-badge review-badge--'+tag+(overlay?' is-overlay':'')}>{REVIEW_LABELS[tag]}{item.adminEdited&&<small> · 管理员已编辑</small>}</span>
}
