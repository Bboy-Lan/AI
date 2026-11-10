// Post-release readback for the 2026-11-10 image/UX round: both public origins, fresh browser and stale cache.
// Run: node scripts/verify-ux-public-20261110.mjs
import {chromium} from 'playwright-core'
import {writeFileSync,mkdirSync} from 'node:fs'

const ORIGINS=[
 {id:'pages',base:'https://bboy-lan.github.io/AI/'},
 // The CloudBase test domain answers fresh browsers with a Tencent risk interstitial, so it is read back
 // at the HTTP level only and never used as the no-prompt production entry.
 {id:'hosting',base:'https://cloud-ynnu-d6gs8ekf7dbcbe80e-1517920911.tcloudbaseapp.com/',ui:false},
]
const legacyAssets={
 pages:['/AI/assets/index-BWgSAIDG.js','/AI/assets/index-Cffx27Pj.css'],
 hosting:['/assets/index-DRtJZsBK.js','/assets/index-Cffx27Pj.css'],
}
const results=[],consoleErrors=[],runtimeErrors=[]
const record=(origin,name,ok,detail)=>{results.push({origin,name,ok,detail});console.log((ok?'PASS ':'FAIL ')+origin+' · '+name+(detail?' · '+detail:''))}
async function check(origin,name,fn){try{const detail=await fn();record(origin,name,true,detail)}catch(error){record(origin,name,false,(error&&error.message)||String(error))}}

const html={}
for(const origin of ORIGINS){
 const response=await fetch(origin.base+'?release=ux-20261110',{headers:{'Cache-Control':'no-cache'}})
 html[origin.id]={status:response.status,text:await response.text()}
}
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']})

for(const origin of ORIGINS){
 const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true,locale:'zh-CN'})
 const page=await context.newPage()
 page.on('console',message=>{if(message.type()==='error')consoleErrors.push(origin.id+': '+message.text())})
 page.on('pageerror',error=>runtimeErrors.push(origin.id+': '+String(error.message||error)))
 const prefix=origin.id==='pages'?'/AI':''

 await check(origin.id,'HTML 引用本轮新主包',async()=>{
  const script=html[origin.id].text.match(/src="([^"]*\/assets\/index-[^"]*\.js)"/)
  if(!script)throw new Error('HTML 未引用主脚本')
  if(!/index-CJ4CPwd0|index-B_HOo9zM/.test(script[1]))throw new Error('仍是旧主包：'+script[1])
  return `status=${html[origin.id].status} ${script[1]}`
 })

 await check(origin.id,'新主包与懒加载分块可实际下载',async()=>{
  const missing=[]
  const assets=[...html[origin.id].text.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map(m=>m[1])
  for(const asset of assets){
   const response=await fetch(new URL(asset,origin.base).toString(),{method:'HEAD'})
   if(response.status!==200)missing.push(asset+'='+response.status)
  }
  if(missing.length)throw new Error(missing.join(' ; '))
  return assets.length+' 个首屏资源 HTTP 200'
 })

 await check(origin.id,'旧缓存 HTML 引用的分块仍在（升级不被白屏）',async()=>{
  const gone=[]
  for(const path of legacyAssets[origin.id]){
   const response=await fetch(new URL(path,origin.base).toString(),{method:'HEAD'})
   if(response.status!==200)gone.push(path+'='+response.status)
  }
  if(gone.length)throw new Error(gone.join(' ; '))
  return '旧版 JS/CSS 均 HTTP 200'
 })

 if(origin.ui===false){
  await check(origin.id,'备用域名对全新浏览器返回风险提醒，不作为无提示入口',async()=>{
   const response=await page.goto(origin.base+'?demo=student#/me',{waitUntil:'domcontentloaded'})
   const body=await page.content()
   if(response.status()<400&&!body.includes('风险提醒'))throw new Error('未复现风险提醒页，需重新评估该域名定位')
   return 'HTTP '+response.status()+' · 风险提醒页（已知边界）'
  })
  await context.close()
  continue
 }
 await page.goto(origin.base+'?demo=student#/me',{waitUntil:'networkidle'})
 await page.waitForSelector('.page',{timeout:20000})

 await check(origin.id,'我的页面导出入口与真实 xlsx 下载',async()=>{
  await page.getByRole('button',{name:/导出 Excel/}).click()
  await page.waitForSelector('.export-page',{timeout:10000})
  await page.getByRole('button',{name:/全选当前筛选结果/}).click()
  const summary=await page.locator('.export-selection span').innerText()
  const [download]=await Promise.all([
   page.waitForEvent('download',{timeout:30000}),
   page.getByRole('button',{name:'生成并下载 .xlsx'}).click(),
  ])
  const name=download.suggestedFilename()
  if(!name.endsWith('.xlsx'))throw new Error('下载文件名不是 xlsx：'+name)
  return `${summary} · ${name}`
 })

 await check(origin.id,'首页无审核徽章且三种排列可切换',async()=>{
  await page.goto(origin.base+'?demo=student#/',{waitUntil:'networkidle'})
  await page.waitForSelector('.page',{timeout:20000})
  const badges=await page.locator('.review-badge').count()
  if(badges)throw new Error('首页出现 '+badges+' 个审核徽章')
  await page.locator('.layout-switch button',{hasText:'格子'}).click()
  await page.waitForSelector('.food-tile',{timeout:10000})
  await page.reload({waitUntil:'networkidle'})
  await page.waitForSelector('.food-tile',{timeout:10000})
  const kept=await page.evaluate(()=>localStorage.getItem('xsyj-home-layout'))
  if(kept!=='grid')throw new Error('刷新后未保留排列方式：'+kept)
  return '0 徽章 · 刷新后仍为格子视图'
 })

 await check(origin.id,'五颗评分星在窄屏与宽屏均完整',async()=>{
  const widths=[320,1440],bad=[]
  for(const width of widths){
   await page.setViewportSize({width,height:844})
   await page.goto(origin.base+'?demo=student#/detail/demo-food-1',{waitUntil:'networkidle'})
   const state=await page.evaluate(()=>{
    const stars=[...document.querySelectorAll('.stars button')].slice(0,5)
    const box=document.querySelector('.stars')?.getBoundingClientRect()
    return {count:stars.length,last:stars.at(-1)?.getBoundingClientRect(),box,inner:innerWidth}
   })
   if(state.count<5)bad.push(width+' 只有 '+state.count+' 颗星')
   else if(!state.last||state.last.right>state.inner+1||state.last.width<20)bad.push(width+' 第 5 颗不可见/'+Math.round(state.last?.width||0))
  }
  await page.setViewportSize({width:390,height:844})
  if(bad.length)throw new Error(bad.join(' ; '))
  return widths.join('/')+' px 五颗星完整'
 })

 await check(origin.id,'评分信息与排列按钮按新版呈现',async()=>{
  await page.goto(origin.base+'?demo=student#/',{waitUntil:'networkidle'})
  await page.waitForSelector('.layout-switch button',{timeout:20000})
  await page.locator('.layout-switch button',{hasText:'卡片'}).click()
  await page.waitForSelector('.food-card',{timeout:15000})
  const badge=(await page.locator('.food-card .rating-badge').first().innerText()).replace(/\s+/g,' ').trim()
  const radius=await page.locator('.layout-switch button').first().evaluate(el=>getComputedStyle(el).borderRadius)
  if(!badge.includes('★'))throw new Error('卡片评分未按新版呈现：'+badge)
  if(!/99px|9999px/.test(radius))throw new Error('排列按钮没有统一为胶囊画风：'+radius)
  await page.goto(origin.base+'?demo=student#/detail/demo-food-1',{waitUntil:'networkidle'})
  await page.waitForSelector('.rating-line .rating-score',{timeout:20000})
  const score=(await page.locator('.rating-line .rating-score').innerText()).trim()
  const stars=await page.locator('.rating-line .rating-stars').innerText()
  if(!score||stars.replace(/[★☆\s]/g,'')!=='')throw new Error('详情评分条不完整：'+score+' / '+stars)
  return `卡片「${badge}」 · 详情 ${score} 分 · 排列按钮圆角 ${radius}`
 })

 await check(origin.id,'头像可放大且不跳转',async()=>{
  await page.goto(origin.base+'?demo=student#/detail/demo-food-1',{waitUntil:'networkidle'})
  await page.waitForSelector('.page',{timeout:20000})
  const before=page.url()
  await page.locator('.avatar-button').first().click()
  await page.waitForSelector('.avatar-zoom',{timeout:10000})
  await page.locator('.avatar-zoom-actions button',{hasText:'关闭'}).click()
  await page.waitForSelector('.avatar-zoom',{state:'detached',timeout:10000})
  if(page.url()!==before)throw new Error('放大头像时发生了跳转')
  return '弹层开合正常，URL 未变'
 })

 await check(origin.id,'推荐理由只在详情页展示，首页卡片不再占位',async()=>{
  await page.goto(origin.base+'?demo=student#/',{waitUntil:'networkidle'})
  await page.waitForSelector('.layout-switch button',{timeout:20000})
  await page.locator('.layout-switch button',{hasText:'卡片'}).click()
  await page.waitForSelector('.food-card',{timeout:15000})
  const cardReasons=await page.locator('.food-card .food-reason').count()
  const cards=await page.locator('.food-card').count()
  if(cardReasons)throw new Error('首页卡片仍有 '+cardReasons+' 处推荐理由')
  await page.goto(origin.base+'?demo=student#/detail/demo-food-1',{waitUntil:'networkidle'})
  await page.waitForSelector('.detail-reasons .reason-chip',{timeout:15000})
  const chips=await page.locator('.detail-reasons .reason-chip').count()
  const first=(await page.locator('.detail-reasons .reason-chip').first().innerText()).trim()
  if(!chips)throw new Error('详情页没有推荐理由')
  return `${cards} 张卡片 0 理由 · 详情 ${chips} 条「${first}」`
 })

 await check(origin.id,'待处理用红色数字角标提示，与用户消息数字一致',async()=>{
  await page.goto(origin.base+'?demo=student#/',{waitUntil:'networkidle'})
  await page.waitForSelector('.tabbar .count-badge',{timeout:20000})
  const tab=(await page.locator('.tabbar .count-badge').first().innerText()).trim()
  const color=await page.locator('.tabbar .count-badge').first().evaluate(el=>getComputedStyle(el).backgroundColor)
  if(!/^\d{1,3}\+?$/.test(tab))throw new Error('底部导航角标不是数字：'+tab)
  if(color!=='rgb(233, 78, 60)')throw new Error('角标不是站内红色：'+color)
  await page.goto(origin.base+'?demo=student#/me',{waitUntil:'networkidle'})
  const entry=page.locator('.me .message-entry .count-badge').first()
  await entry.waitFor({timeout:15000})
  const messages=(await entry.innerText()).trim()
  if(messages!==tab)throw new Error('互动消息数字与导航不一致：'+messages+' / '+tab)
  return `导航 ${tab} · 互动消息 ${messages} · ${color}`
 })

 await check(origin.id,'管理员用户列表按头像摘要紧凑排布，一行两个',async()=>{
  await page.goto(origin.base+'?demo=admin#/admin',{waitUntil:'networkidle'})
  await page.waitForSelector('.page.admin',{timeout:20000})
  await page.getByRole('button',{name:'用户',exact:true}).click()
  await page.waitForSelector('.admin-people .admin-person',{timeout:20000})
  const state=await page.evaluate(()=>{
   const cards=[...document.querySelectorAll('.admin-people .admin-person')],tops=new Map()
   for(const card of cards){const top=Math.round(card.getBoundingClientRect().top);tops.set(top,(tops.get(top)||0)+1)}
   return {count:cards.length,perRow:[...tops.values()],avatars:cards.filter(c=>c.querySelector('.admin-person-avatar img')).length,tallest:Math.max(...cards.map(c=>Math.round(c.getBoundingClientRect().height))),tags:cards.map(c=>(c.querySelector('.admin-person-tag')?.textContent||'').trim())}
  })
  if(!state.count)throw new Error('线上用户页没有用户卡片')
  if(state.perRow.some(n=>n<2||n>3))throw new Error('每行不是2～3个：'+state.perRow.join(','))
  if(state.avatars!==state.count)throw new Error('有卡片缺少缩略头像：'+state.avatars+'/'+state.count)
  if(state.tallest>80)throw new Error('卡片仍然过高：'+state.tallest+'px')
  return `${state.count} 位 · 每行 ${state.perRow.join('/')} · 最高 ${state.tallest}px · ${[...new Set(state.tags)].join('/')}`
 })

 await check(origin.id,'详情页可一键导航到高德并切换其他地图',async()=>{
  await page.goto(origin.base+'?demo=student#/detail/demo-food-1',{waitUntil:'networkidle'})
  await page.waitForSelector('.map-card',{timeout:20000})
  await page.evaluate(()=>{window.__opened=[];window.open=(url)=>{window.__opened.push(String(url));return null}})
  await page.getByRole('button',{name:/导航到这里/}).click()
  const opened=await page.evaluate(()=>window.__opened)
  if(!opened.length||!/uri\.amap\.com\/marker\?position=[\d.]+,[\d.]+/.test(opened[0]))throw new Error('未打开高德导航：'+opened[0])
  if(!/coordinate=gaode/.test(opened[0]))throw new Error('高德链接缺少 coordinate=gaode')
  await page.getByRole('button',{name:'其他地图',exact:true}).click()
  await page.waitForSelector('.map-alt',{timeout:10000})
  const alternatives=await page.locator('.map-alt button').allInnerTexts()
  if(alternatives.length!==4)throw new Error('备用入口数量不对：'+alternatives.join('/'))
  await page.getByRole('button',{name:'腾讯地图',exact:true}).click()
  const toTencent=await page.evaluate(()=>window.__opened[window.__opened.length-1])
  if(!/apis\.map\.qq\.com\/uri\/v1\/marker\?marker=coord:/.test(toTencent))throw new Error('腾讯链接不对：'+toTencent)
  return `高德 ${opened[0].slice(0,40)}… · 备用 ${alternatives.length} 项`
 })

 await check(origin.id,'选点弹窗按高德底图解析分享链接并回填地点名',async()=>{
  await page.goto(origin.base+'?demo=student#/',{waitUntil:'networkidle'})
  await page.waitForSelector('.filter-toggle',{timeout:20000})
  await page.locator('.filter-toggle').click()
  await page.getByRole('button',{name:/设置出发点|更换出发点/}).click()
  await page.waitForSelector('.map-picker-overlay',{timeout:10000})
  const tools=await page.locator('.map-tools .chip').allInnerTexts()
  if(!tools.some(x=>/用我的位置/.test(x))||!tools.some(x=>/底图 · 高德/.test(x)))throw new Error('缺少定位或高德底图入口：'+tools.join('|'))
  await page.locator('.map-advanced textarea').first().fill('https://uri.amap.com/marker?position=102.71688,25.05021&name=%E6%A5%A0%E8%8B%91%E9%A3%9F%E5%A0%82&coordinate=gaode')
  await page.getByRole('button',{name:'解析并使用',exact:true}).click()
  await page.waitForFunction(()=>/已按粘贴的位置更新选点/.test(document.body.textContent||''),null,{timeout:10000})
  const coord=(await page.locator('.map-picker-overlay .map-coord').innerText()).replace(/\s+/g,' ')
  if(!/25\.050\d+/.test(coord)||!/102\.716\d+/.test(coord))throw new Error('粘贴后坐标不对：'+coord)
  const name=await page.locator('.map-picker-card input').first().inputValue()
  if(name!=='楠苑食堂')throw new Error('没有回填地点名：'+name)
  await page.locator('.map-picker-overlay .announcement-heading button').click()
  await page.waitForSelector('.map-picker-overlay',{state:'detached',timeout:10000})
  return `${coord} · 回填「${name}」`
 })

 await check(origin.id,'评价昵称紧挨头像，分数贴右对齐',async()=>{
  await page.goto(origin.base+'?demo=admin#/detail/demo-food-1',{waitUntil:'networkidle'})
  await page.waitForSelector('.review-card',{timeout:20000})
  const rows=await page.evaluate(()=>[...document.querySelectorAll('.review-card')].map(card=>{
   const rect=el=>el?el.getBoundingClientRect():null
   const avatar=card.querySelector('.review-avatar'),name=card.querySelector('.review-card>div>.link')||card.querySelector('div>.link'),score=card.querySelector('em')
   return {gap:rect(name).left-rect(avatar).right,scoreToRight:rect(card).right-rect(score).right,nameHeight:Math.round(rect(name).height)}
  }))
  if(!rows.length)throw new Error('详情页没有评价卡片')
  const loose=rows.filter(x=>x.gap>12||x.gap<-1)
  if(loose.length)throw new Error('头像与昵称间距异常：'+loose.map(x=>Math.round(x.gap)+'px').join(','))
  const unaligned=rows.filter(x=>x.scoreToRight<4||x.scoreToRight>24)
  if(unaligned.length)throw new Error('分数没有贴右边：'+unaligned.map(x=>Math.round(x.scoreToRight)).join(','))
  if(rows.some(x=>x.nameHeight>30))throw new Error('昵称被挤成多行')
  return `${rows.length} 条 · 头像→昵称 ${Math.round(rows[0].gap)}px · 分数距右 ${Math.round(rows[0].scoreToRight)}px`
 })

 await check(origin.id,'页面运行无脚本错误',async()=>{
  const errors=consoleErrors.filter(e=>e.startsWith(origin.id+':')).concat(runtimeErrors.filter(e=>e.startsWith(origin.id+':')))
  if(errors.length)throw new Error(errors.slice(0,3).join(' | '))
  return 'consoleErrors=0 pageErrors=0'
 })
 await context.close()
}

await browser.close()
const summary={checkedAt:new Date().toISOString(),passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,consoleErrors,runtimeErrors,results}
mkdirSync('docs/evidence',{recursive:true})
writeFileSync('docs/evidence/ux-public-20261110.json',JSON.stringify(summary,null,2))
console.log('\nSUMMARY '+summary.passed+' passed / '+summary.failed+' failed')
process.exit(summary.failed?1:0)
