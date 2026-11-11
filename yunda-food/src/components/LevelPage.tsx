import {useEffect,useRef} from 'react'
import {LEVELS,MESSAGES,type DailyLevelView} from '../domain/daily-level'
import {RoleBadge} from './RoleBadge'

// A modal that shows one account's level status, Bilibili-style: the current badge plus growth
// points, consecutive days and next-level progress. On the owner's own "我的" page it additionally
// shows the full ladder (showLadder) so the upgrade concept is visible at a glance.
export function LevelPage({level,isAdmin,isSelf=false,showLadder=false,onClose}:{level:DailyLevelView|null,isAdmin:boolean,isSelf?:boolean,showLadder?:boolean,onClose:()=>void}){
  const ref=useRef<HTMLElement>(null)
  useEffect(()=>{
    const previous=document.body.style.overflow
    document.body.style.overflow='hidden'
    ref.current?.querySelector<HTMLElement>('button')?.focus()
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()}
    addEventListener('keydown',key)
    return()=>{document.body.style.overflow=previous;removeEventListener('keydown',key)}
  },[onClose])
  const pct=level?(level.next_title?Math.min(100,Math.round(level.streak/(level.streak+level.days_to_next)*100)):100):0
  const currentIndex=level?level.level_index:-1
  return <div className="level-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
    <section ref={ref} className="level-sheet" role="dialog" aria-modal="true" aria-labelledby="level-sheet-title">
      <header className="level-sheet-head"><h2 id="level-sheet-title">{isSelf?'我的等级':'Ta 的等级'}</h2><button className="chip" onClick={onClose}>关闭</button></header>
      {isAdmin
        ? <div className="level-summary level-summary--max"><div className="level-summary-head"><RoleBadge admin/><span>最高身份</span></div><p className="level-summary-hint">{MESSAGES.adminLevel}</p></div>
        : level&&<div className="level-summary">
          <div className="level-summary-head"><RoleBadge title={level.title}/><span>每日 {level.effective_limit} 条</span></div>
          <div className="level-stats">
            <span>成长值<b>{level.exp}</b></span>
            <span>连续活跃<b>{level.streak} 天</b></span>
            <span>每日额度<b>{level.effective_limit} 条</b></span>
          </div>
          <div className="level-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="距下一等级进度"><i style={{width:pct+'%'}}/></div>
          <p className="level-summary-progress">{level.level_progress}</p>
          {isSelf&&<p className="level-summary-hint">{level.quota_hint} · {level.upgrade_hint}</p>}
          {isSelf&&<p className="level-summary-exp">{level.exp_hint}</p>}
          {isSelf&&level.override_active&&<p className="level-summary-override">管理员单独设置：{level.override_value} 条/日{level.override_expires_on?' · 有效至 '+level.override_expires_on:''}</p>}
        </div>}
      {showLadder&&<div className="level-ladder">{LEVELS.map((rule,i)=>{const cond=rule.minExp>0?`连续签到 ${rule.minDays} 天 · 或成长值 ${rule.minExp}`:i===0?'新用户默认等级':`连续签到 ${rule.minDays} 天`;return <div className={'level-rung'+(i===currentIndex?' is-current':'')} key={rule.title}><span className="rung-badge"><RoleBadge title={rule.title}/></span><span className="rung-info"><b className="rung-title">{rule.title}</b><span className="rung-cond">{cond}</span></span><span className="rung-quota">每日 {rule.dailyLimit} 条</span></div>})}</div>}
    </section>
  </div>
}
