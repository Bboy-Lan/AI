import {EXPORT_FIELDS,type ExportColumn} from '../domain/export-config'

export type SheetOptions={sheetName:string,header:string[],rows:(string|number)[][],columns:ExportColumn[]}

// ExcelJS is a local dependency loaded only when someone actually exports.
export async function buildXlsx(options:SheetOptions):Promise<Blob>{
 const module=await import('exceljs')
 const ExcelJS=((module as unknown as {default?:{Workbook:new()=>unknown}}).default||module) as {Workbook:new()=>any}
 const workbook=new ExcelJS.Workbook()
 const sheet=workbook.addWorksheet(String(options.sheetName||'美食').slice(0,30),{views:[{state:'frozen',ySplit:1}]})
 // Text cells stay text (no <f> formula elements); numbers keep a numeric cell type.
 sheet.columns=options.columns.map((column,index)=>({header:options.header[index]||column.title,key:'c'+index,width:EXPORT_FIELDS[column.id].width}))
 sheet.addRows(options.rows.map(row=>Object.fromEntries(row.map((value,index)=>['c'+index,value]))))
 sheet.getRow(1).eachCell((cell:any)=>{
  cell.font={bold:true,color:{argb:'FF1D5781'}}
  cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE3EEF5'}}
  cell.alignment={vertical:'middle',wrapText:true}
 })
 sheet.eachRow((row:any)=>{row.eachCell((cell:any)=>{cell.alignment={...cell.alignment,vertical:'top',wrapText:true}})})
 const buffer=await workbook.xlsx.writeBuffer()
 return new Blob([buffer as unknown as ArrayBuffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
}

export function saveBlob(blob:Blob,fileName:string){
 const url=URL.createObjectURL(blob)
 const link=document.createElement('a')
 link.href=url
 link.download=fileName
 link.rel='noopener'
 document.body.appendChild(link)
 link.click()
 link.remove()
 // Revoke later: Safari needs the URL alive while the download starts.
 setTimeout(()=>URL.revokeObjectURL(url),20000)
}
