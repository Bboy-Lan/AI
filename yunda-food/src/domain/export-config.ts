// Pure export configuration: field order, titles, cell values. No DOM or workbook code here.
import type {Food} from '../services/local-repository'

export type ExportFieldId='storeName'|'name'|'category'|'address'|'price'|'priceBasis'|'note'|'locationType'|'updatedAt'

export type ExportField={id:ExportFieldId,title:string,width:number,kind:'text'|'number'}

export type ExportColumn={id:ExportFieldId,title:string,enabled:boolean}

export const EXPORT_FIELDS:Record<ExportFieldId,{defaultTitle:string,width:number,kind:'text'|'number'}>={
 storeName:{defaultTitle:'店名 / 摊位名',width:22,kind:'text'},
 name:{defaultTitle:'美食名字',width:20,kind:'text'},
 category:{defaultTitle:'分类',width:10,kind:'text'},
 address:{defaultTitle:'地址',width:34,kind:'text'},
 price:{defaultTitle:'参考价格（元）',width:13,kind:'number'},
 priceBasis:{defaultTitle:'价格口径',width:11,kind:'text'},
 note:{defaultTitle:'备注',width:32,kind:'text'},
 locationType:{defaultTitle:'校内 / 校外',width:11,kind:'text'},
 updatedAt:{defaultTitle:'更新时间',width:12,kind:'text'},
}

export const EXPORT_LIMIT=2000

export function defaultColumns():ExportColumn[]{
 return [
  {id:'storeName',title:EXPORT_FIELDS.storeName.defaultTitle,enabled:true},
  {id:'name',title:EXPORT_FIELDS.name.defaultTitle,enabled:true},
  {id:'address',title:EXPORT_FIELDS.address.defaultTitle,enabled:true},
  {id:'price',title:EXPORT_FIELDS.price.defaultTitle,enabled:true},
  {id:'priceBasis',title:EXPORT_FIELDS.priceBasis.defaultTitle,enabled:true},
  {id:'note',title:EXPORT_FIELDS.note.defaultTitle,enabled:true},
  {id:'category',title:EXPORT_FIELDS.category.defaultTitle,enabled:false},
  {id:'locationType',title:EXPORT_FIELDS.locationType.defaultTitle,enabled:false},
  {id:'updatedAt',title:EXPORT_FIELDS.updatedAt.defaultTitle,enabled:false},
 ]
}

export function moveColumn(columns:ExportColumn[],index:number,direction:-1|1){
 const next=index+direction
 if(next<0||next>=columns.length)return columns
 const copy=[...columns]
 ;[copy[index],copy[next]]=[copy[next],copy[index]]
 return copy
}

// Control characters break the sheet; text stays text so no formula is ever emitted.
export function excelSafeText(value:unknown){
 if(value==null)return ''
 const raw=String(value).replace(/\r\n?/g,'\n').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'')
 const leadingTrimmed=raw.replace(/^\n+/,'')
 return leadingTrimmed.length>1000?leadingTrimmed.slice(0,1000):leadingTrimmed
}

export function priceBasisLabel(value?:string){return value==='portion'?'单份价格':value==='person'?'人均价格':'未标注'}

export function addressOf(food:Food){
 const place=String(food.placeText||'').trim()
 const extra=String(food.addressSummary||'').trim()
 if(!extra||place.includes(extra))return place||extra
 return place?place+' · '+extra:extra
}

export function cellValue(food:Food,id:ExportFieldId,notes:Record<string,string>={}):string|number{
 switch(id){
  case 'storeName':return excelSafeText(food.storeName)
  case 'name':return excelSafeText(food.name)
  case 'category':return excelSafeText(food.category)
  case 'address':return excelSafeText(addressOf(food))
  case 'price':return typeof food.price==='number'&&Number.isFinite(food.price)?food.price:''
  case 'priceBasis':return priceBasisLabel(food.priceBasis)
  case 'note':return excelSafeText(notes[food.id]??food.description??'')
  case 'locationType':return food.locationType==='inside'?'校内':'校外'
  case 'updatedAt':return excelSafeText(food.updatedAt||'')
 }
 return ''
}

export function buildExportMatrix(items:Food[],columns:ExportColumn[],notes:Record<string,string>={}){
 const active=columns.filter(column=>column.enabled)
 const header=active.map(column=>column.title.trim()||EXPORT_FIELDS[column.id].defaultTitle)
 const rows=items.map(food=>active.map(column=>cellValue(food,column.id,notes)))
 return {header,rows,columns:active}
}

export function exportFileName(scope:'all'|'mine'|'favorites',date=new Date()){
 const stamp=`${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`
 const label=scope==='all'?'全部美食':scope==='favorites'?'我的收藏':'我的投稿'
 return `小食云记-${label}-${stamp}.xlsx`
}

export function downloadHint(){
 return '电脑浏览器一般会直接下载；手机和微信里若没有自动保存，请在下载记录/文件传输助手中查找，或使用浏览器“分享 → 存储到文件”。'
}
