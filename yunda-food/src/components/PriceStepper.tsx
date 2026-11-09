import {useEffect,useId,useRef} from 'react'
import {stepPrice,integerPrice} from '../domain/price-step'

export function PriceStepper({value,onChange}:{value:number|undefined,onChange:(value:number|undefined)=>void}){
 const id=useId(),current=useRef(value),emit=useRef(onChange),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined)
 current.current=value;emit.current=onChange
 const stop=()=>{if(timer.current!==undefined){clearTimeout(timer.current);timer.current=undefined}}
 const bump=(direction:1|-1)=>{const next=stepPrice(current.current,direction);if(Object.is(next,current.current))return false;current.current=next;emit.current(next);return true}
 const start=(event:React.PointerEvent<HTMLButtonElement>,direction:1|-1)=>{
  if(event.button!==0)return
  event.preventDefault();stop();event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId)
  if(!bump(direction))return
  const repeat=()=>{if(bump(direction))timer.current=setTimeout(repeat,90);else stop()}
  timer.current=setTimeout(repeat,400)
 }
 useEffect(()=>{const hidden=()=>{if(document.hidden)stop()};window.addEventListener('blur',stop);document.addEventListener('visibilitychange',hidden);return()=>{stop();window.removeEventListener('blur',stop);document.removeEventListener('visibilitychange',hidden)}},[])
 return <div className="price-field"><label htmlFor={id}>价格 · 元 <i>必填</i></label><div className="price-stepper"><input id={id} aria-label="价格 · 元" aria-describedby={id+'-hint'} type="number" inputMode="numeric" step="1" min="1" max="999" value={value??''} onChange={e=>onChange(e.target.value===''?undefined:integerPrice(Number(e.target.value)))} onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();stop();bump(e.key==='ArrowUp'?1:-1)}}} required/><div className="price-stepper-controls" role="group" aria-label="调整价格">{([-1,1] as const).map(direction=><button key={direction} type="button" aria-label={direction===1?'增加1元':'减少1元'} disabled={Object.is(stepPrice(value,direction),value)} onPointerDown={e=>start(e,direction)} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop} onBlur={stop} onContextMenu={e=>e.preventDefault()} onClick={e=>{if(e.detail===0)bump(direction)}}>{direction===1?'＋':'−'}</button>)}</div></div><small id={id+'-hint'} className="price-stepper-hint">每次1元，长按连续调整</small></div>
}
