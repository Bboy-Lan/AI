import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EXPORT_LIMIT, addressOf, buildExportMatrix, defaultColumns, excelSafeText,
  exportFileName, moveColumn, priceBasisLabel,
} from '../src/domain/export-config'
import type {Food} from '../src/services/local-repository'

const base:Food={id:'f1',name:'小锅米线',storeName:'楠苑米线铺',category:'正餐',price:12,priceBasis:'portion',locationType:'inside',placeText:'云南大学 · 呈贡校区 · 楠苑一楼',addressSummary:'楠苑一楼 3 号窗口',author:'小云朵',hometown:'云南省昆明市',tags:[],images:[],description:'汤底香，出餐快',updatedAt:'2026-11-09T10:00:00+08:00'}
const legacy:Food={...base,id:'f2',name:'烤饵块',storeName:undefined,description:undefined}

test('默认导出包含店名、菜名、地址、价格、口径与备注', () => {
  const enabled=defaultColumns().filter(column=>column.enabled).map(column=>column.id)
  assert.deepEqual(enabled, ['storeName','name','address','price','priceBasis','note'])
})

test('列顺序可调整且不越界', () => {
  const columns=defaultColumns()
  assert.equal(moveColumn(columns,0,-1),columns)
  assert.equal(moveColumn(columns,columns.length-1,1),columns)
  const moved=moveColumn(columns,1,1)
  assert.equal(moved[1].id,'address')
  assert.equal(moved[2].id,'name')
})

test('表头使用自定义标题，未启用列不输出', () => {
  const columns=defaultColumns().map(column=>column.id==='note'?{...column,enabled:false}:column.id==='storeName'?{...column,title:'店铺'}:column)
  const {header,rows}=buildExportMatrix([base],columns,{})
  assert.equal(header[0],'店铺')
  assert.equal(header.includes('备注'),false)
  assert.equal(rows[0].length,5)
  assert.equal(rows[0][0],'楠苑米线铺')
})

test('价格保持数值类型与真实口径，缺失时写未标注', () => {
  const columns=defaultColumns()
  const {rows}=buildExportMatrix([base,{...base,id:'f3',priceBasis:undefined,price:undefined}],columns,{})
  assert.equal(rows[0][3],12)
  assert.equal(typeof rows[0][3],'number')
  assert.equal(rows[0][4],'单份价格')
  assert.equal(rows[1][3],'')
  assert.equal(rows[1][4],'未标注')
  assert.equal(priceBasisLabel('person'),'人均价格')
})

test('地址合并地点与补充地址且不重复', () => {
  assert.equal(addressOf(base),'云南大学 · 呈贡校区 · 楠苑一楼 · 楠苑一楼 3 号窗口')
  assert.equal(addressOf({...base,placeText:'楠苑一楼 3 号窗口'}),'楠苑一楼 3 号窗口')
  assert.equal(addressOf({...base,placeText:'',addressSummary:'校内 2 号摊'}),'校内 2 号摊')
})

test('备注优先使用本次临时备注，其次原推荐理由', () => {
  const columns=defaultColumns()
  const withNote=buildExportMatrix([base],columns,{'f1':'这次想买两份'})
  assert.equal(withNote.rows[0][5],'这次想买两份')
  const fallback=buildExportMatrix([base],columns,{})
  assert.equal(fallback.rows[0][5],'汤底香，出餐快')
  const empty=buildExportMatrix([legacy],columns,{})
  assert.equal(empty.rows[0][5],'')
})

test('旧记录没有店名时导出为空，而不是拿菜名或地址顶替', () => {
  const {rows}=buildExportMatrix([legacy],defaultColumns(),{})
  assert.equal(rows[0][0],'')
  assert.equal(rows[0][1],'烤饵块')
})

test('文本清洗去掉控制字符、保留换行、限制长度', () => {
  assert.equal(excelSafeText('第一行\r\n第二行'),'第一行\n第二行')
  assert.equal(excelSafeText('坏\x00字符\x07'),'坏字符')
  assert.equal(excelSafeText('=1+1'),'=1+1')
  assert.equal(excelSafeText('-2').startsWith('-'),true)
  assert.equal(excelSafeText('x'.repeat(1200)).length,1000)
  assert.equal(excelSafeText(null),'')
})

test('文件名带范围与日期，导出上限为 2000 行', () => {
  assert.equal(exportFileName('mine',new Date(2026,10,10)),'小食云记-我的投稿-20261110.xlsx')
  assert.equal(exportFileName('favorites',new Date(2026,0,2)),'小食云记-我的收藏-20260102.xlsx')
  assert.equal(EXPORT_LIMIT,2000)
})
