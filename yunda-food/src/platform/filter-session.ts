import {useState,useEffect,useRef,type Dispatch,type SetStateAction} from 'react'
// Native filter-session: tabs share temporary filters only during one foreground session.
const values=new Map<string,unknown>()
if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{if(!document.hidden){values.clear();window.dispatchEvent(new Event('xsyj-foreground'))}})
export function useFilterState<T>(scope:string,key:string,initial:T|(()=>T)):[T,Dispatch<SetStateAction<T>>]{
 const id=scope+':'+key,defaults=useRef(initial),getDefault=()=>typeof defaults.current==='function'?(defaults.current as ()=>T)():defaults.current
 const [value,setValue]=useState<T>(()=>values.has(id)?values.get(id) as T:getDefault())
 const update:Dispatch<SetStateAction<T>>=next=>setValue(old=>{const v=typeof next==='function'?(next as (previous:T)=>T)(old):next;values.set(id,v);return v})
 useEffect(()=>{const reset=()=>setValue(getDefault());addEventListener('xsyj-foreground',reset);return()=>removeEventListener('xsyj-foreground',reset)},[id])
 return [value,update]
}
