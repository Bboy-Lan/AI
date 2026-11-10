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
 pages:['/AI/assets/index-B1taL3Pk.js','/AI/assets/index-2mIxrOBZ.css'],
 hosting:['/assets/index-DoRE9Ebs.js','/assets/index-2mIxrOBZ.css'],
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
  if(!/index-BIb016w1|index-CghoQdey/.test(script[1]))throw new Error('仍是旧主包：'+script[1])
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
  await page.waitForSelector('.food-card',{timeout:20000})
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
