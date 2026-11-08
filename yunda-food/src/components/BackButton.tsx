export function BackButton({onClick}:{onClick:()=>void}){
 return <button type="button" className="nav-icon-button" aria-label="返回" title="返回" onClick={onClick}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
}
