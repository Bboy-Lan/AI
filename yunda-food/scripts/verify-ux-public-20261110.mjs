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
 pages:['/AI/assets/index-DJNTHebY.js','/AI/assets/index-BUnYOHWK.css'],
 hosting:['/assets/index-DZQTh9yM.js','/assets/index-BUnYOHWK.css'],
}
const results=[],consoleErrors=[],runtimeErrors=[]
const record=(origin,name,ok,detail)=>{results.push({origin,name,ok,detail});console.log((ok?'PASS ':'FAIL ')+origin+' · '+name+(detail?' · '+detail:''))}
async function check(origin,name,fn){try{const detail=await fn();record(origin,name,true,detail)}catch(error){record(origin,name,false,(error&&error.message)||String(error))}}

const html={}
for(const origin of ORIGINS){
 const response=await fetch(origin.base+'?release=ux-20261110',{headers:{'Cache-Control':'no-cache'}})
 html[origin.id]={status:response.status,text:await response.text()}
}

for(const origin of ORIGINS){
 // One browser per origin: a heavy demo page in the previous origin must not take the next one down.
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']})
 const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true,locale:'zh-CN'})
 const page=await context.newPage()
 page.on('console',message=>{if(message.type()==='error')consoleErrors.push(origin.id+': '+message.text())})
 page.on('pageerror',error=>runtimeErrors.push(origin.id+': '+String(error.message||error)))
 const prefix=origin.id==='pages'?'/AI':''

 await check(origin.id,'HTML 引用本轮新主包',async()=>{
  const script=html[origin.id].text.match(/src="([^"]*\/assets\/index-[^"]*\.js)"/)
  if(!script)throw new Error('HTML 未引用主脚本')
  if(!/index-DVLEUcS7|index-3tv12hP3/.test(script[1]))throw new Error('仍是旧主包：'+script[1])
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
  await browser.close()
  continue
 }
 await page.goto(origin.base+'?demo=student#/me',{waitUntil:'networkidle'})
 await page.waitForSelector('.page',{timeout:20000})

 await check(origin.id,'我的页面导出入口与真实 xlsx 下载',async()=>{
  await page.getByRole('button',{name:/导出表格/}).click()
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

 await check(origin.id,'卡片缩略图贴满卡片高度，图片下方不再留白',async()=>{
  await page.goto(origin.base+'?demo=student#/',{waitUntil:'networkidle'})
  await page.waitForSelector('.layout-switch button',{timeout:20000})
  await page.locator('.layout-switch button',{hasText:'卡片'}).click()
  await page.waitForSelector('.food-card',{timeout:15000})
  const cards=await page.evaluate(()=>[...document.querySelectorAll('.food-card')].map(card=>{
   const box=card.getBoundingClientRect(),media=card.querySelector('.food-media').getBoundingClientRect(),style=getComputedStyle(card)
   const innerTop=box.top+parseFloat(style.paddingTop)+parseFloat(style.borderTopWidth)
   const innerBottom=box.bottom-parseFloat(style.paddingBottom)-parseFloat(style.borderBottomWidth)
   return {width:Math.round(media.width),height:Math.round(media.height),below:Math.round(innerBottom-media.bottom),above:Math.round(media.top-innerTop)}
  }))
  if(!cards.length)throw new Error('首页没有卡片')
  const bad=cards.filter(c=>c.below>1||c.above>1)
  if(bad.length)throw new Error(bad.length+' 张卡片图片仍有留白：'+bad.map(c=>'上'+c.above+'/下'+c.below).join(','))
  return `${cards.length} 张 · 图 ${cards[0].width}×${cards[0].height}px 贴满 · 留白 0`
 })

 await check(origin.id,'“只看同乡”只剩一行主文案且与筛选同排',async()=>{
  const state=await page.evaluate(()=>{
   const toggle=document.querySelector('.hometown-toggle'),filter=document.querySelector('.filter-toggle')
   const box=el=>{const r=el.getBoundingClientRect();return {top:Math.round(r.top),height:Math.round(r.height),text:(el.innerText||'').replace(/\s+/g,' ').trim(),small:el.querySelectorAll('small').length}}
   return {toggle:box(toggle),filter:box(filter),scroll:document.documentElement.scrollWidth,inner:innerWidth}
  })
  if(state.toggle.small)throw new Error('按钮里还留着副标题')
  if(state.toggle.top!==state.filter.top)throw new Error('同乡按钮与筛选不在同一行')
  if(Math.abs(state.toggle.height-state.filter.height)>1)throw new Error('两个按钮不等高')
  if(state.scroll>state.inner+1)throw new Error('工具行横向溢出')
  return `「${state.toggle.text}」${state.toggle.height}px 同排`
 })

 await check(origin.id,'评价超过三条折叠，可展开再收起',async()=>{
  await page.goto(origin.base+'?demo=student#/detail/demo-food-1',{waitUntil:'networkidle'})
  await page.waitForSelector('.review-card',{timeout:20000})
  if(await page.locator('.review-fold').count())throw new Error('三条以内的评价也出现折叠条')
  await page.goto(origin.base+'?demo=student&reviewCase=bulk#/detail/bulk-food-000',{waitUntil:'networkidle'})
  await page.waitForSelector('.review-fold',{timeout:20000})
  const folded=await page.locator('.review-card').count()
  const label=(await page.locator('.review-fold').innerText()).replace(/\s+/g,' ')
  if(folded!==3)throw new Error('默认没有折叠到 3 条：'+folded)
  await page.locator('.review-fold').click()
  await page.waitForFunction(()=>document.querySelectorAll('.review-card').length>3,null,{timeout:10000})
  const expanded=await page.locator('.review-card').count()
  await page.locator('.review-fold').click()
  await page.waitForFunction(()=>document.querySelectorAll('.review-card').length===3,null,{timeout:10000})
  return `${folded} 条（${label}）→ 展开 ${expanded} 条 → 收起`
 })

 await check(origin.id,'详情页点赞计数可增减，收藏等同下次想吃',async()=>{
  await page.goto(origin.base+'?demo=student#/detail/demo-food-1',{waitUntil:'networkidle'})
  await page.waitForSelector('.detail-actions',{timeout:20000})
  const read=()=>page.evaluate(()=>{const like=document.querySelector('.like-action'),fav=document.querySelector('.favorite-action');return {like:like.innerText.replace(/\s+/g,' ').trim(),pressed:like.getAttribute('aria-pressed'),fav:fav.innerText.replace(/\s+/g,' ').trim(),buttons:document.querySelectorAll('.detail-actions .button').length}})
  const initial=await read()
  if(initial.buttons!==3)throw new Error('方框里不是三个按钮：'+initial.buttons)
  await page.locator('.like-action').click()
  await page.waitForFunction(()=>document.querySelector('.like-action')?.getAttribute('aria-pressed')==='true',null,{timeout:10000})
  const liked=await read()
  await page.locator('.like-action').click()
  await page.waitForFunction(()=>document.querySelector('.like-action')?.getAttribute('aria-pressed')==='false',null,{timeout:10000})
  const back=await read()
  await page.locator('.favorite-action').click()
  await page.waitForFunction(()=>document.querySelector('.favorite-action')?.getAttribute('aria-pressed')==='true',null,{timeout:10000})
  const fav=await read()
  if(liked.like===initial.like)throw new Error('点赞没有更新计数：'+liked.like)
  if(back.like!==initial.like)throw new Error('取消点赞没有回到原值：'+back.like)
  if(!/已收藏/.test(fav.fav))throw new Error('收藏没有回显：'+fav.fav)
  if(!/想吃/.test(initial.fav))throw new Error('收藏按钮丢了“想吃”口径：'+initial.fav)
  await page.locator('.favorite-action').click()
  return `点赞 ${initial.like} → ${liked.like} → ${back.like} · 收藏 ${fav.fav}`
 })

 await check(origin.id,'导出新增“全部美食”且排在最前',async()=>{
  await page.goto(origin.base+'?demo=student#/export',{waitUntil:'networkidle'})
  await page.waitForSelector('.export-page',{timeout:20000})
  const chips=await page.locator('.export-card').first().locator('.chips').first().locator('button').allInnerTexts()
  if(!/^全部美食/.test(chips[0]||''))throw new Error('全部美食没有排在最前：'+chips.join(' | '))
  if(!chips.some(t=>/我的投稿/.test(t))||!chips.some(t=>/我的收藏/.test(t)))throw new Error('原有范围缺失：'+chips.join(' | '))
  await page.getByRole('button',{name:/全选当前筛选结果/}).click()
  const [download]=await Promise.all([page.waitForEvent('download',{timeout:30000}),page.getByRole('button',{name:'生成并下载 .xlsx'}).click()])
  const name=download.suggestedFilename()
  if(!/全部美食/.test(name))throw new Error('文件名没有体现全部美食：'+name)
  return `${chips.join(' | ')} · ${name}`
 })

 await check(origin.id,'首页可切换排布方式并显示点赞数',async()=>{
  await page.goto(origin.base+'?demo=student#/',{waitUntil:'networkidle'})
  await page.waitForSelector('.sort-row .sort-chip',{timeout:20000})
  const chips=await page.locator('.sort-row .sort-chip').allInnerTexts()
  if(chips.join('|')!=='推荐顺序|点赞最多|最新发布|评分最高')throw new Error('排布按钮不对：'+chips.join('|'))
  await page.locator('.sort-chip').filter({hasText:'点赞最多'}).click()
  await page.waitForTimeout(300)
  const counts=await page.locator('.food-card').evaluateAll(cards=>cards.map(card=>{const text=card.querySelector('.like-mini')?.textContent||'';return Number((text.match(/(\d+)/)||[])[1]||0)}))
  for(let i=1;i<counts.length;i++)if(counts[i]>counts[i-1])throw new Error('点赞没有从高到低：'+counts.join(','))
  return `${chips.join(' / ')} · 赞 ${counts.join('>')}`
 })

 await check(origin.id,'互动消息未读标签醒目，点开原文后变为已读',async()=>{
  await page.goto(origin.base+'?demo=student#/messages',{waitUntil:'networkidle'})
  await page.waitForSelector('.message',{timeout:20000})
  const before=await page.locator('.read-tag.is-unread').count()
  if(!before)throw new Error('没有未读消息')
  const color=await page.locator('.read-tag.is-unread').first().evaluate(node=>getComputedStyle(node).backgroundColor)
  await page.locator('.message.unread .message-item').first().click()
  await page.waitForTimeout(600)
  await page.goto(origin.base+'?demo=student#/messages',{waitUntil:'networkidle'})
  await page.waitForSelector('.message',{timeout:20000})
  const after=await page.locator('.read-tag.is-unread').count()
  if(after>=before)throw new Error('点开后仍未标记已读：'+before+'→'+after)
  return `未读 ${before}→${after} · 底色 ${color}`
 })

 await check(origin.id,'管理员私信面板可发起，用户侧只能回复',async()=>{
  await page.goto(origin.base+'?demo=admin#/messages?mode=direct',{waitUntil:'networkidle'})
  await page.waitForSelector('.dm-thread',{timeout:20000})
  const threads=await page.locator('.dm-thread').count()
  await page.locator('.dm-thread').first().click()
  await page.waitForTimeout(400)
  await page.locator('.dm-composer textarea').fill('公网读回：管理员私信测试。')
  await page.getByRole('button',{name:'发送'}).click()
  await page.waitForTimeout(700)
  const sent=await page.locator('.dm-bubble.me').last().innerText()
  if(!/管理员私信测试/.test(sent))throw new Error('管理员消息没有发出：'+sent)
  await page.goto(origin.base+'?demo=student#/messages?mode=direct',{waitUntil:'networkidle'})
  await page.waitForSelector('.dm-panel',{timeout:20000})
  if(await page.locator('.dm-threads').count())throw new Error('用户侧出现发起对话的用户列表')
  const hint=await page.locator('.dm-panel .muted').innerText()
  if(!/只有管理员可以主动发起私信/.test(hint))throw new Error('用户侧说明缺失')
  return threads+' 个对话 · 管理员已发送 · 用户侧只读可回'
 })

 await check(origin.id,'地址去重与店名缩进按本轮口径显示',async()=>{
  await page.goto(origin.base+'?demo=admin#/detail/demo-food-1',{waitUntil:'networkidle'})
  await page.waitForSelector('.food-location',{timeout:20000})
  const place=(await page.locator('.food-location span').innerText()).trim()
  if((place.match(/云南大学/g)||[]).length!==1)throw new Error('学校名重复：'+place)
  const indent=await page.locator('.store-name').evaluate(node=>parseFloat(getComputedStyle(node).paddingLeft))
  if(indent<6)throw new Error('店名没有缩进：'+indent)
  return place+' · 店名缩进 '+indent+'px'
 })

 await check(origin.id,'避雷只保留店铺、美食与具体地址，卡片带头像',async()=>{
  await page.goto(origin.base+'?demo=admin#/tree-compose',{waitUntil:'networkidle'})
  await page.waitForSelector('.form-page',{timeout:20000})
  const form=await page.locator('.form-page').innerText()
  if(!form.includes('美食名称')||form.includes('消费日期'))throw new Error('表单字段不是三字段口径')
  await page.goto(origin.base+'?demo=admin#/treehole?tab=black',{waitUntil:'networkidle'})
  await page.waitForSelector('.caution-card',{timeout:20000})
  const card=page.locator('.caution-card').first()
  if(!await card.locator('.caution-byline img, .caution-byline span').count())throw new Error('卡片没有作者头像')
  const dish=await card.locator('.caution-body>strong').innerText()
  const store=(await card.locator('.store-name').innerText()).replace(/\s+/g,' ')
  return dish+' · '+store
 })

 await check(origin.id,'页面运行无脚本错误',async()=>{
  const errors=consoleErrors.filter(e=>e.startsWith(origin.id+':')).concat(runtimeErrors.filter(e=>e.startsWith(origin.id+':')))
  if(errors.length)throw new Error(errors.slice(0,3).join(' | '))
  return 'consoleErrors=0 pageErrors=0'
 })
 await context.close()
 await browser.close()
}
const summary={checkedAt:new Date().toISOString(),passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,consoleErrors,runtimeErrors,results}
mkdirSync('docs/evidence',{recursive:true})
writeFileSync('docs/evidence/ux-public-20261110.json',JSON.stringify(summary,null,2))
console.log('\nSUMMARY '+summary.passed+' passed / '+summary.failed+' failed')
process.exit(summary.failed?1:0)
