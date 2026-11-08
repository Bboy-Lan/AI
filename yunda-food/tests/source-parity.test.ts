import {readFileSync} from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import test from 'node:test'
import {filterItems,normalize,dateLabel,toggleTag,type Preferences} from '../src/domain/discovery'
import {sortMessages,clearable,type Message} from '../src/domain/rules'
import type {Food} from '../src/services/local-repository'
const root=path.resolve('reference/miniapp/miniprogram/services')
function source(name:string):any{
 const file=path.resolve(root,name+'.js'),module={exports:{}};vm.runInNewContext(readFileSync(file,'utf8'),{module,exports:module.exports,require:(name:string)=>name==='./location'?{point:()=>null}:source(name.slice(2)),wx:{getStorageSync:()=>null}},{filename:file});return module.exports
}
const plain=(value:any)=>JSON.parse(JSON.stringify(value))
test('发现页和盲盒：同输入对照原小程序筛选、严格口味、预算及偏好排序（432组）',()=>{
 const original=source('discovery')
 const foods:Food[]=Array.from({length:32},(_,i)=>({id:String(i),name:i%2?'米线':'ABC奶茶',category:i%4===0?'饮品':i%4===1?'甜品':i%4===2?'正餐':'小吃',venue:'窗口'+i,placeText:'窗口'+i,school:'云南大学',campus:'呈贡校区',region:'昆明呈贡',locationType:i%2?'inside':'outside',price:i%7?5+i:undefined,priceBasis:i%5?i%2?'portion':'person':undefined,taste:i%3?{spicy:i%4,sweet:i%4,tags:i%2?['清淡']:['香辣'],staple:'米线'}:{},images:[],tags:[],author:'同学',hometown:i%2?'云南省昆明市':'四川省成都市',status:i%11?'public':'hidden'}))
 const rows=foods.map(f=>({...f,status:f.status==='public'?'published':'hidden',authorHometown:f.hometown}))
 const prefs:Preferences={hometown:'云南省昆明市',spicy:2,tags:['清淡'],staple:'米线',budget:''}
 let checked=0
 for(const category of ['全部','正餐','饮品'])for(const spicy of [null,0,2])for(const sweet of [null,0,3])for(const budget of ['',20,60,100])for(const people of [1,3])for(const hometownOnly of [false,true]){
  const filters={category,spicy,sweet,budget,people,hometownOnly};const want=plain(original.filterItems(rows,filters,prefs));const got=filterItems(foods,filters,prefs)
  assert.deepEqual(got.map(f=>[f.id,f.orderScore,f.reasons]),want.map((f:any)=>[f.id,f.orderScore,f.reasons]));checked++
 }
 assert.equal(checked,432)
 // User-requested display wording differs; numeric levels and filtering remain identical.
 for(let i=0;i<foods.length;i++){const got=normalize(foods[i]),want=plain(original.normalize(rows[i]));assert.deepEqual(got.taste,want.taste);assert.equal(got.tasteText,want.tasteText.replaceAll('很辣','爆辣'))}
})

test('爆辣保留原最高辣度3，并兼容已保存的很辣文字',()=>{
 const food:Food={id:'legacy-hot',name:'米线',category:'正餐',locationType:'inside',spicy:'很辣',tags:[],images:[],author:'同学',hometown:'云南省昆明市',placeText:'窗口',status:'public'}
 for(const item of [food,{...food,spicy:'爆辣'},{...food,spicy:undefined,taste:{spicy:3}}]){
  assert.equal(normalize(item).taste.spicy,3)
  assert.equal(normalize(item).tasteText,'爆辣')
  assert.deepEqual(filterItems([item],{spicy:3}).map(f=>f.id),['legacy-hot'])
  assert.equal(filterItems([item],{spicy:2}).length,0)
 }
})
test('投稿口味互斥、北京时间日期、消息回复排序和清理条件与源一致',()=>{
 const tags=source('taste-tags'),presentation=source('detail-presentation'),order=source('message-order')
 for(const current of [[],['正常'],['偏咸','香辣'],['酸香']])for(const value of ['正常','偏甜','香辣','未定义'])assert.deepEqual(toggleTag(current,value),plain(tags.toggle(current,value)))
 for(const date of [null,'2026-11-05','2026-11-04T17:00:00Z','2026-11-04T15:59:59Z',{$date:'2026-11-04T18:00:00Z'},{_seconds:1793811600},'invalid'])assert.equal(dateLabel(date),presentation.dateLabel(date))
 const rows:Message[]=Array.from({length:16},(_,i)=>({_id:String(i),createdAt:'2026-11-01',replies:i%3?[{createdAt:'2026-11-05T0'+i%9+':00:00Z'}]:[],read:i%2===0,userUnread:i%3===0,readState:i%2?'unread':'read',status:i%3?'resolved':'pending',kind:i%5?'feedback':'account_appeal'}))
 for(const mode of ['feedback','issues','messages'] as const)for(const admin of [false,true]){assert.deepEqual(sortMessages(rows,mode,admin).map(r=>r._id),plain(order.sort(rows,mode,admin)).map((r:any)=>r._id));for(const row of rows)assert.equal(clearable(row,mode,admin),Boolean(order.clearable(row,mode,admin)))}
})
