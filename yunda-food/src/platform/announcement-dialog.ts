// Keep acknowledgement and editing actions inside the open announcement.
export function announcementKeyboard(event:KeyboardEvent){
 if(event.key==='Escape'){event.preventDefault();event.stopPropagation();return}
 if(event.key!=='Tab')return
 const modal=document.querySelector('.announcement-overlay.is-open')
 if(!modal)return
 const controls=Array.from(modal.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled)')).filter(node=>node.getClientRects().length>0)
 const first=controls[0],last=controls.at(-1)
 if(!first)return
 if(!modal.contains(document.activeElement)||event.shiftKey&&document.activeElement===first){event.preventDefault();(event.shiftKey?last:first)?.focus()}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
}
