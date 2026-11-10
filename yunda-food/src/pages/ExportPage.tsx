import {useMemo,useState} from 'react'
import {BackButton} from '../components/BackButton'
import {repository,type Food} from '../services/repository'
import {buildXlsx,saveBlob} from '../services/xlsx'
import {CATEGORIES} from '../domain/discovery'
import {
 EXPORT_LIMIT,buildExportMatrix,defaultColumns,downloadHint,exportFileName,moveColumn,
 type ExportColumn,
} from '../domain/export-config'

const go=(path:string)=>{location.hash=path}
type Scope='mine'|'favorites'

function matches(food:Food,keyword:string,category:string,location:string){
 const words=keyword.trim().toLowerCase()
 if(words&&![food.storeName,food.name,food.placeText,food.category].join(' ').toLowerCase().includes(words))return false
 if(category!=='全部'&&food.category!==category)return false
 if(location!=='all'&&food.locationType!==location)return false
 return true
}

export function ExportPage(){
 const [scope,setScope]=useState<Scope>('mine')
 const [keyword,setKeyword]=useState('')
 const [category,setCategory]=useState('全部')
 const [location,setLocation]=useState('all')
 const [selected,setSelected]=useState<string[]>([])
 const [columns,setColumns]=useState<ExportColumn[]>(()=>defaultColumns())
 const [notes,setNotes]=useState<Record<string,string>>({})
 const [busy,setBusy]=useState(false)
 const [status,setStatus]=useState('')
 const [error,setError]=useState('')
 const source=scope==='mine'?repository.mine:repository.favorites
 const filtered=useMemo(()=>source.filter(food=>matches(food,keyword,category,location)),[source,keyword,category,location])
 const chosen=useMemo(()=>filtered.filter(food=>selected.includes(food.id)),[filtered,selected])
 const activeColumns=columns.filter(column=>column.enabled)
 const preview=buildExportMatrix(chosen.slice(0,5),columns,notes)
 const toggle=(id:string)=>setSelected(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id])
 const selectAll=()=>setSelected(filtered.slice(0,EXPORT_LIMIT).map(food=>food.id))
 const clear=()=>setSelected([])
 const switchScope=(next:Scope)=>{setScope(next);setSelected([]);setStatus('');setError('')}
 const rename=(index:number,title:string)=>setColumns(current=>current.map((column,i)=>i===index?{...column,title}:column))
 const toggleColumn=(index:number)=>setColumns(current=>current.map((column,i)=>i===index?{...column,enabled:!column.enabled}:column))
 const move=(index:number,direction:-1|1)=>setColumns(current=>moveColumn(current,index,direction))
 const exportNow=async()=>{
  if(busy)return
  setError('');setStatus('')
  const rows=chosen.slice(0,EXPORT_LIMIT)
  if(!rows.length){setError('请先勾选要导出的美食。');return}
  if(!activeColumns.length){setError('请至少保留一列导出内容。');return}
  setBusy(true)
  try{
   const matrix=buildExportMatrix(rows,columns,notes)
   const blob=await buildXlsx({sheetName:scope==='mine'?'我的投稿':'我的收藏',header:matrix.header,rows:matrix.rows,columns:matrix.columns})
   const name=exportFileName(scope)
   saveBlob(blob,name)
   setStatus(`已生成 ${name} · ${rows.length} 行 × ${matrix.header.length} 列。${downloadHint()}`)
  }catch(e){setError('导出没有完成：'+((e as Error).message||'请重试。')+' 如果反复失败，可以先减少列数或分批导出。')}
  finally{setBusy(false)}
 }
 return <main className="page export-page"><BackButton onClick={()=>history.back()}/><h1>导出 Excel</h1><p className="muted">只导出当前账号有权读取的内容；导出文件保存在你的设备上，不会改动云端记录。</p>
  <section className="card export-card"><h3>1. 选取美食</h3><div className="chips">{(['mine','favorites'] as Scope[]).map(value=><button type="button" key={value} className={scope===value?'chip active':'chip'} onClick={()=>switchScope(value)}>{value==='mine'?'我的投稿 '+repository.mine.length:'我的收藏 '+repository.favorites.length}</button>)}</div>
   <label>搜索店名或美食名<input value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder="输入店名 / 美食名字 / 地点"/></label>
   <div className="chips">{CATEGORIES.map(value=><button type="button" key={value} className={category===value?'chip active':'chip'} onClick={()=>setCategory(value)}>{value}</button>)}</div>
   <div className="chips">{[['all','全部地点'],['inside','高校内'],['outside','高校外']].map(([value,label])=><button type="button" key={value} className={location===value?'chip active':'chip'} onClick={()=>setLocation(value)}>{label}</button>)}</div>
   <div className="export-selection"><button type="button" className="link" onClick={selectAll} disabled={!filtered.length}>全选当前筛选结果（{Math.min(filtered.length,EXPORT_LIMIT)} 条）</button><button type="button" className="link" onClick={clear} disabled={!selected.length}>取消选择</button><span>已选 {chosen.length} / {filtered.length} 条</span></div>
   {filtered.length?<div className="export-list">{filtered.slice(0,200).map(food=><label className="export-item" key={food.id}><input type="checkbox" checked={selected.includes(food.id)} onChange={()=>toggle(food.id)}/><span className="export-item-copy"><b>{food.name}{food.storeName?' · '+food.storeName:''}</b><small>{food.placeText} · {food.category} · {food.price==null?'价格待补':'¥'+food.price+(food.priceBasis==='person'?'/人':'/份')}</small></span></label>)}</div>:<div className="empty">没有符合条件的内容。<button type="button" className="link" onClick={()=>{setKeyword('');setCategory('全部');setLocation('all')}}>清除筛选</button></div>}
   {filtered.length>200&&<p className="muted">列表只显示前 200 条，全选会包含全部 {Math.min(filtered.length,EXPORT_LIMIT)} 条筛选结果。</p>}
  </section>
  <section className="card export-card"><h3>2. 选择导出内容</h3><p className="muted">勾选需要的列，可直接修改列标题，用 ↑ ↓ 调整顺序。</p>{columns.map((column,index)=><div className="export-field" key={column.id}><input type="checkbox" checked={column.enabled} onChange={()=>toggleColumn(index)} aria-label={'导出'+column.title}/><input type="text" value={column.title} maxLength={20} onChange={e=>rename(index,e.target.value)} aria-label="列标题"/><button type="button" disabled={index===0} onClick={()=>move(index,-1)} aria-label={'上移'+column.title}>↑</button><button type="button" disabled={index===columns.length-1} onClick={()=>move(index,1)} aria-label={'下移'+column.title}>↓</button></div>)}<p className="muted">价格按原口径输出（单份 / 人均），没有标注的写“未标注”，不做人均换算。</p></section>
  <section className="card export-card"><h3>3. 本次备注（可选）</h3><p className="muted">只写入导出文件，不会改动云端原记录。</p>{chosen.length?chosen.slice(0,20).map(food=><label key={food.id}>{food.name} 的备注<input value={notes[food.id]??''} maxLength={120} placeholder="留空则使用原推荐理由" onChange={e=>setNotes({...notes,[food.id]:e.target.value})}/></label>):<p className="muted">先在上方勾选美食，才能填写本次备注。</p>}{chosen.length>20&&<p className="muted">备注编辑只列出前 20 条，其余沿用原推荐理由。</p>}</section>
  <section className="card export-card"><h3>4. 预览与导出</h3>{activeColumns.length?<><div className="export-preview"><table><thead><tr>{preview.header.map((title,index)=><th key={index}>{title}</th>)}</tr></thead><tbody>{preview.rows.map((row,rowIndex)=><tr key={rowIndex}>{row.map((value,cellIndex)=><td key={cellIndex}>{value===''?'—':String(value)}</td>)}</tr>)}</tbody></table></div><p className="muted">预览为前 {preview.rows.length} 行、{preview.header.length} 列；实际导出 {chosen.length} 行。</p></>:<p className="notice">至少启用一列才能导出。</p>}
   <div className="export-summary"><b>将导出 {chosen.length} 条 · {activeColumns.length} 列</b><button type="button" className="button primary" disabled={busy||!chosen.length||!activeColumns.length} onClick={()=>void exportNow()}>{busy?'正在生成…':'生成并下载 .xlsx'}</button></div>
   {status&&<p className="notice" role="status">{status}</p>}{error&&<p className="notice" role="alert">{error}</p>}
  </section>
  <button type="button" className="link" onClick={()=>go('/me')}>返回我的</button>
 </main>
}
