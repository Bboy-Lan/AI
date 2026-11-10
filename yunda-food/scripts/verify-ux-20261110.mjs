// Local browser verification for the 2026-11-10 image/UX round.
// Run: node scripts/verify-ux-20261110.mjs
import {chromium} from 'playwright-core'
import {writeFileSync,mkdirSync,readFileSync,existsSync} from 'node:fs'

const BASE='http://127.0.0.1:5173/'
const results=[]
const runtimeErrors=[]
const consoleErrors=[]
function record(name,ok,detail){results.push({name,ok,detail});console.log((ok?'PASS ':'FAIL ')+name+(detail?' · '+detail:''))}
async function check(name,fn){try{const detail=await fn();record(name,true,detail)}catch(error){record(name,false,(error&&error.message)||String(error))}}

const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']})
const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true,locale:'zh-CN',deviceScaleFactor:1})
const page=await context.newPage()
page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())})
page.on('pageerror',error=>runtimeErrors.push(String(error.message||error)))

await page.goto(BASE+'?demo=student#/me',{waitUntil:'networkidle'})
await page.waitForSelector('.page',{timeout:15000})

await check('我的页面出现导出 Excel 入口',async()=>{
 const button=page.getByRole('button',{name:/导出 Excel/})
 await button.waitFor({timeout:8000})
 return await button.innerText()
})

await check('导出页可筛选、全选并显示已选数量',async()=>{
 await page.getByRole('button',{name:/导出 Excel/}).click()
 await page.waitForSelector('.export-page',{timeout:8000})
 const items=await page.locator('.export-item').count()
 await page.getByRole('button',{name:/全选当前筛选结果/}).click()
 const summary=await page.locator('.export-selection span').innerText()
 const previewHeaders=await page.locator('.export-preview th').allInnerTexts()
 if(items<1)throw new Error('演示数据没有可导出的投稿')
 if(!/已选 [1-9]/.test(summary))throw new Error('已选数量未更新：'+summary)
 if(!previewHeaders.includes('店名 / 摊位名'))throw new Error('预览缺少店名列：'+previewHeaders.join('|'))
 return `列表${items}条 · ${summary} · 预览列${previewHeaders.length}`
})

await check('导出真实 .xlsx 文件并写入磁盘',async()=>{
 mkdirSync('.tmpview',{recursive:true})
 const [download]=await Promise.all([
  page.waitForEvent('download',{timeout:20000}),
  page.getByRole('button',{name:/生成并下载/}).click(),
 ])
 const name=download.suggestedFilename()
 if(!/\.xlsx$/.test(name))throw new Error('文件名不是 xlsx：'+name)
 await download.saveAs('.tmpview/export-demo.xlsx')
 const status=await page.locator('.export-page .notice').last().innerText().catch(()=>'')
 return name+' · '+(status.slice(0,40)||'已下载')
})

await check('首页默认不显示已审核/待审核徽章',async()=>{
 await page.goto(BASE+'?demo=student#/',{waitUntil:'networkidle'})
 await page.waitForSelector('.food-card',{timeout:8000})
 const badges=await page.locator('.review-badge').count()
 if(badges!==0)throw new Error('普通浏览仍出现 '+badges+' 个审核徽章')
 return '0 个徽章'
})

await check('首页三种排列可切换且保留搜索与筛选',async()=>{
 const search=page.locator('input.search')
 await search.fill('米线')
 const before=await search.inputValue()
 await page.getByRole('button',{name:'紧凑'}).click()
 await page.waitForSelector('.food-row',{timeout:5000})
 const rows=await page.locator('.food-row').count()
 const afterSearch=await search.inputValue()
 await page.getByRole('button',{name:'格子'}).click()
 await page.waitForSelector('.food-tile',{timeout:5000})
 const tiles=await page.locator('.food-tile').count()
 await page.reload({waitUntil:'networkidle'})
 await page.waitForSelector('.food-tile',{timeout:8000})
 const persisted=await page.evaluate(()=>localStorage.getItem('xsyj-home-layout'))
 const persistedSearch=await page.locator('input.search').inputValue()
 if(before!==afterSearch)throw new Error('切换视图重置了搜索')
 if(rows<1||tiles<1)throw new Error('视图没有渲染条目')
 if(persisted!=='grid')throw new Error('排列偏好未保存：'+persisted)
 return `紧凑${rows}行 · 格子${tiles}个 · 刷新后保留${persisted}${persistedSearch?' · 搜索保留':''}`
})

const widths=[320,360,375,390,414,430,768,1024,1440]
await check('五颗评分星在 320-1440 宽度均完整可见可点',async()=>{
 await page.setViewportSize({width:390,height:844})
 await page.goto(BASE+'?demo=student#/detail/demo-food-1',{waitUntil:'networkidle'})
 await page.waitForSelector('.stars button',{timeout:8000})
 const report=[]
 for(const width of widths){
  await page.setViewportSize({width,height:844})
  await page.waitForTimeout(120)
  const boxes=await page.evaluate(()=>{
   const wrap=document.querySelector('.stars'),buttons=[...document.querySelectorAll('.stars button')]
   if(!wrap||buttons.length!==5)return {count:buttons.length}
   const outer=wrap.getBoundingClientRect()
   return {count:buttons.length,overflow:buttons.map(b=>{const r=b.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height}}),outer:{left:outer.left,right:outer.right},scroll:document.documentElement.scrollWidth}
  })
  if(boxes.count!==5)throw new Error(width+'px 只有'+boxes.count+'颗星')
  for(const box of boxes.overflow){
   if(box.width<24||box.height<24)throw new Error(width+'px 星星触摸区域过小')
   if(box.left<boxes.outer.left-1||box.right>boxes.outer.right+1)throw new Error(width+'px 星星被裁切')
  }
  if(boxes.scroll>width+1)throw new Error(width+'px 出现横向溢出')
  report.push(width)
 }
 return report.join('/')+' px'
})

await check('横屏与放大字体下星级仍完整',async()=>{
 await page.setViewportSize({width:844,height:390})
 await page.goto(BASE+'?demo=student#/detail/demo-food-1',{waitUntil:'networkidle'})
 await page.waitForSelector('.stars button',{timeout:8000})
 const landscape=await page.evaluate(()=>{const b=[...document.querySelectorAll('.stars button')].map(x=>x.getBoundingClientRect());return {n:b.length,right:Math.max(...b.map(x=>x.right)),inner:innerWidth}})
 if(landscape.n!==5||landscape.right>landscape.inner+1)throw new Error('横屏星级越界')
 await page.setViewportSize({width:360,height:760})
 await page.addStyleTag({content:'html{font-size:19px}'})
 await page.waitForTimeout(150)
 const zoomed=await page.evaluate(()=>{const wrap=document.querySelector('.stars').getBoundingClientRect(),b=[...document.querySelectorAll('.stars button')].map(x=>x.getBoundingClientRect());return {n:b.length,right:Math.max(...b.map(x=>x.right)),wrap:wrap.right,scroll:document.documentElement.scrollWidth}})
 if(zoomed.n!==5||zoomed.right>zoomed.wrap+1)throw new Error('大字体下星级被裁切')
 if(zoomed.scroll>361)throw new Error('大字体下横向溢出')
 await page.getByRole('button',{name:'5分'}).click()
 const pressed=await page.getByRole('button',{name:'5分'}).getAttribute('aria-pressed')
 if(pressed!=='true')throw new Error('第 5 颗星点击无效')
 return '横屏 + 19px 基准字号 + 第5颗可点'
})

await check('头像可点击放大且不触发卡片跳转',async()=>{
 const zoomTargets=await page.evaluate(()=>document.querySelectorAll('.avatar-button').length)
 if(!zoomTargets)throw new Error('演示数据没有可放大的头像')
 await page.locator('.avatar-button').first().click()
 await page.waitForSelector('.avatar-zoom',{timeout:5000})
 const urlBefore=page.url()
 const dialog=await page.locator('.avatar-zoom').getAttribute('aria-modal')
 await page.locator('.avatar-zoom-actions button',{hasText:'关闭'}).click()
 await page.waitForSelector('.avatar-zoom',{state:'detached',timeout:5000})
 if(page.url()!==urlBefore)throw new Error('打开头像时发生了页面跳转')
 return `${zoomTargets} 个头像可放大 · aria-modal=${dialog}`
})

await check('浏览器内图片管线压缩大图并按用途限尺寸',async()=>{
 await page.goto(BASE+'?demo=student#/',{waitUntil:'networkidle'})
 const result=await page.evaluate(async()=>{
  const module=await import('/src/services/image.ts')
  const make=async(width,height)=>{
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height
   const context=canvas.getContext('2d')
   const gradient=context.createLinearGradient(0,0,width,height)
   gradient.addColorStop(0,'#276ea0');gradient.addColorStop(.5,'#f1c75b');gradient.addColorStop(1,'#e94e3c')
   context.fillStyle=gradient;context.fillRect(0,0,width,height)
   context.fillStyle='#1c2b2d';context.font='bold 48px sans-serif'
   for(let y=60;y<height;y+=140)context.fillText('小食云记 文字可读性验证 '+y,40,y)
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'))
   return new File([blob],'original.png',{type:'image/png'})
  }
  const photo=await module.prepareImage(await make(3000,2000),'photo')
  const avatar=await module.prepareImage(await make(1600,1600),'avatar')
  const longShot=await module.prepareImage(await make(1080,6000),'evidence')
  let broken=''
  try{await module.prepareImage(new File([new Uint8Array([1,2,3,4])],'broken.jpg',{type:'image/jpeg'}),'photo')}catch(error){broken=error.message}
  return {
   photo:{bytes:photo.bytes,type:photo.type,w:photo.width,h:photo.height,rounds:photo.rounds},
   avatar:{bytes:avatar.bytes,type:avatar.type,w:avatar.width,h:avatar.height},
   longShot:{bytes:longShot.bytes,type:longShot.type,w:longShot.width,h:longShot.height},
   broken,
  }
 })
 const {photo,avatar,longShot,broken}=result
 if(photo.bytes>1.6*1024*1024*1.05)throw new Error('普通照片未压到目标体积：'+photo.bytes)
 if(Math.max(photo.w,photo.h)>2048)throw new Error('普通照片长边超限：'+photo.w+'x'+photo.h)
 if(!['image/webp','image/jpeg','image/png'].includes(photo.type))throw new Error('输出类型异常：'+photo.type)
 if(avatar.bytes>320*1024*1.1)throw new Error('头像未压到目标体积：'+avatar.bytes)
 if(Math.max(avatar.w,avatar.h)>768)throw new Error('头像尺寸超限')
 if(Math.max(longShot.w,longShot.h)>4096)throw new Error('长截图长边超限')
 if(Math.max(longShot.w,longShot.h)<2000)throw new Error('长截图像素过低，文字会糊')
 if(!/解码|格式|损坏/.test(broken))throw new Error('损坏文件未给出可理解提示：'+broken)
 return `照片 ${(photo.bytes/1024).toFixed(0)}KB ${photo.w}x${photo.h} ${photo.type} · 头像 ${(avatar.bytes/1024).toFixed(0)}KB · 长截图 ${longShot.w}x${longShot.h}（保留可读像素）`
})

await check('真实 HEIC 照片可在浏览器内解码并转成通用格式',async()=>{
 const fixture='scripts/fixtures/heic-sample.heic'
 if(!existsSync(fixture))return '跳过：未找到本地 HEIC 样张（scripts/fixtures/heic-sample.heic）'
 const base64=readFileSync(fixture).toString('base64')
 const result=await page.evaluate(async data=>{
  const module=await import('/src/services/image.ts')
  const binary=atob(data),bytes=new Uint8Array(binary.length)
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i)
  const file=new File([bytes],'IMG_0001.HEIC',{type:'image/heic'})
  const prepared=await module.prepareImage(file,'photo')
  const avatar=await module.prepareImage(new File([bytes],'IMG_0002.heic',{type:'image/heic'}),'avatar')
  return {
   photo:{bytes:prepared.bytes,type:prepared.type,w:prepared.width,h:prepared.height,extension:prepared.extension,reencoded:prepared.reencoded},
   avatar:{bytes:avatar.bytes,type:avatar.type,w:avatar.width,h:avatar.height,extension:avatar.extension},
  }
 },base64)
 const {photo,avatar}=result
 if(!photo.w||!photo.h)throw new Error('HEIC 未解码出像素')
 if(['image/heic','image/heif',''].includes(photo.type))throw new Error('HEIC 未转成通用格式：'+photo.type)
 if(!/^(webp|jpg|jpeg|png)$/.test(photo.extension||''))throw new Error('扩展名未按真实类型生成：'+photo.extension)
 if(photo.bytes>1.6*1024*1024*1.05)throw new Error('HEIC 转码后体积超目标：'+photo.bytes)
 if(avatar.bytes>320*1024*1.1||Math.max(avatar.w,avatar.h)>768)throw new Error('HEIC 头像未按头像策略收敛')
 return `HEIC → ${photo.type} ${photo.w}x${photo.h} ${(photo.bytes/1024).toFixed(0)}KB ${photo.extension} · 头像 ${(avatar.bytes/1024).toFixed(0)}KB ${avatar.extension}`
})

await check('推荐理由从首页卡片移到详情页',async()=>{
 await page.goto(BASE+'?demo=student#/',{waitUntil:'networkidle'})
 await page.waitForSelector('.layout-switch button',{timeout:15000})
 await page.locator('.layout-switch button',{hasText:'卡片'}).click()
 await page.waitForSelector('.food-card',{timeout:15000})
 const inCard=await page.locator('.food-card .food-reason').count()
 await page.goto(BASE+'?demo=student#/detail/demo-food-1',{waitUntil:'networkidle'})
 await page.waitForSelector('.detail-reasons',{timeout:15000})
 const chips=await page.locator('.detail-reasons .reason-chip').allInnerTexts()
 if(inCard)throw new Error('首页卡片仍有推荐理由文字：'+inCard+' 处')
 if(!chips.length)throw new Error('详情页没有推荐理由')
 return '卡片 0 处 · 详情 ' + chips.join(' / ')
})

await check('未读与待办用红色数字角标提示用户与管理员',async()=>{
 const read=async locator=>{const el=locator.first();const text=(await el.innerText()).trim();const color=await el.evaluate(node=>getComputedStyle(node).backgroundColor);if(!/^\d{1,3}\+?$/.test(text))throw new Error('角标不是数字：'+text);if(color!=='rgb(233, 78, 60)')throw new Error('角标底色不是站内红色：'+color);return text}
 await page.goto(BASE+'?demo=student#/',{waitUntil:'networkidle'})
 await page.waitForSelector('.tabbar .count-badge',{timeout:15000})
 const tab=await read(page.locator('.tabbar .count-badge'))
 await page.goto(BASE+'?demo=student#/me',{waitUntil:'networkidle'})
 await page.waitForSelector('.me .message-entry .count-badge',{timeout:15000})
 const message=await read(page.locator('.me .message-entry .count-badge'))
 await page.goto(BASE+'?demo=admin#/me',{waitUntil:'networkidle'})
 await page.waitForSelector('.me .admin-entry .count-badge',{timeout:15000})
 const admin=await read(page.locator('.me .admin-entry .count-badge'))
 await page.goto(BASE+'?demo=admin#/admin',{waitUntil:'networkidle'})
 await page.waitForSelector('.page.admin .chip .count-badge',{timeout:15000})
 const review=await read(page.locator('.page.admin .chip .count-badge'))
 if(Number(review.replace('+',''))<1)throw new Error('审核台待审核数异常：'+review)
 return `导航 ${tab} · 互动消息 ${message} · 用户治理 ${admin} · 集中审核台 ${review}`
})

await check('管理员用户列表改用缩略头像摘要，一行两个不再留白',async()=>{
 await page.goto(BASE+'?demo=admin#/admin',{waitUntil:'networkidle'})
 await page.getByRole('button',{name:'用户',exact:true}).click()
 await page.waitForSelector('.admin-people .admin-person',{timeout:15000})
 const state=await page.evaluate(()=>{
  const cards=[...document.querySelectorAll('.admin-people .admin-person')],rows=new Map()
  for(const card of cards){const top=Math.round(card.getBoundingClientRect().top);rows.set(top,(rows.get(top)||0)+1)}
  return {
   count:cards.length,perRow:[...rows.values()],
   avatars:cards.filter(c=>c.querySelector('.admin-person-avatar img')||(c.querySelector('.admin-person-avatar')?.textContent||'').trim()).length,
   tallest:Math.max(...cards.map(c=>Math.round(c.getBoundingClientRect().height))),
   titles:cards.map(c=>(c.querySelector('b')?.textContent||'').trim()),
   tags:cards.map(c=>(c.querySelector('.admin-person-tag')?.textContent||'').trim()),
   fallbackBlank:cards.filter(c=>!(c.querySelector('.admin-person-avatar img')||(c.querySelector('.admin-person-avatar')?.textContent||'').trim())).length,
   width:Math.round(cards[0].getBoundingClientRect().width)
  }
 })
 if(!state.count)throw new Error('用户页没有渲染任何用户卡片')
 if(state.perRow.some(n=>n<2||n>3))throw new Error('每行不是2～3个：'+state.perRow.join(','))
 if(state.fallbackBlank)throw new Error(state.fallbackBlank+' 张卡片没有头像或默认头像')
 if(state.tallest>80)throw new Error('卡片仍然过高：'+state.tallest+'px')
 if(!state.tags.every(t=>['正常','已封禁','限制发布'].includes(t)))throw new Error('状态标签异常：'+state.tags.join('/'))
 return `${state.count} 位 · 每行 ${state.perRow.join('/')} · 卡片最高 ${state.tallest}px / 宽 ${state.width}px · ${state.titles.slice(0,2).join('、')} · ${[...new Set(state.tags)].join('/')}`
})

await check('管理员可单张驳回配图，作者编辑页出现驳回占位并要求重传',async()=>{
 await page.goto(BASE+'?demo=admin&reviewCase=bulk#/review-admin',{waitUntil:'networkidle'})
 await page.waitForSelector('.review-compact-row',{timeout:15000})
 const target=await page.evaluate(()=>{
  const rows=[...document.querySelectorAll('.review-compact-row')]
  const row=rows.find(r=>(r.getAttribute('data-review-key')||'').startsWith('food:')&&r.querySelector('.review-thumb small'))
  return row?{key:row.getAttribute('data-review-key')||'',title:(row.querySelector('strong')||{}).textContent||''}:null
 })
 if(!target)throw new Error('审核队列里没有带多图的推荐记录')
 await page.locator('.review-compact-row[data-review-key="'+target.key+'"] .review-row-open').click()
 await page.waitForSelector('.review-image-moderate',{timeout:10000})
 await page.waitForFunction(()=>document.querySelectorAll('.review-inspector-gallery img').length>0,null,{timeout:10000})
 const before=await page.locator('.review-inspector-gallery img').count()
 await page.locator('[aria-label="审核处理意见"]').fill('验收：这张照片与内容无关，请更换后重新上传。')
 await page.locator('.review-image-moderate .chips .chip').first().click()
 await page.getByRole('button',{name:'确认驳回这张照片'}).click()
 await page.waitForFunction(count=>document.querySelectorAll('.review-inspector-gallery img').length<count,before,{timeout:10000})
 const notice=await page.locator('.review-image-moderate .notice').innerText()
 const after=await page.locator('.review-inspector-gallery img').count()
 const photoId=target.key.slice(target.key.indexOf(':')+1)
 await page.evaluate(next=>{location.hash=next},'/publish/'+photoId)
 await page.waitForSelector('.gallery-reject-hint',{timeout:10000})
 const hint=await page.locator('.gallery-reject-hint').innerText()
 const placeholder=await page.locator('.photo-tile.is-rejected').count()
 if(!placeholder)throw new Error('作者编辑页没有驳回占位')
 if(!/重新上传/.test(hint))throw new Error('作者端没有要求重新上传：'+hint)
 return `「${target.title.slice(0,10)}」图片 ${before}→${after} · 占位${placeholder} · ${notice.slice(0,16)}`
})

await check('管理员驳回头像后该账号回落到默认头像',async()=>{
 await page.goto(BASE+'?demo=admin#/admin',{waitUntil:'networkidle'})
 await page.waitForSelector('.page.admin',{timeout:10000})
 await page.getByRole('button',{name:'用户',exact:true}).click()
 await page.waitForSelector('.admin-people .admin-person',{timeout:10000})
 await page.locator('.admin-person').filter({hasText:'阿岚同学'}).first().click()
 await page.waitForSelector('.profile-panel header.profile',{timeout:8000})
 await page.locator('.profile-panel textarea').fill('验收：头像含不适内容，请重新上传。')
 await page.getByRole('button',{name:'驳回这张头像'}).click()
 await page.waitForFunction(()=>[...document.querySelectorAll('.profile-panel .notice')].some(n=>/驳回/.test(n.textContent||'')),null,{timeout:10000})
 const panelAvatar=await page.locator('.profile-panel header.profile .avatar').first().innerText()
 if(panelAvatar.trim()!=='食')throw new Error('面板内没有回落到默认头像：'+panelAvatar)
 await page.reload({waitUntil:'networkidle'})
 await page.getByRole('button',{name:'用户',exact:true}).click()
 await page.locator('.admin-person').filter({hasText:'阿岚同学'}).first().click()
 await page.waitForSelector('.profile-panel header.profile',{timeout:8000})
 const afterReload=await page.locator('.profile-panel header.profile .avatar').first().innerText()
 const disabled=await page.getByRole('button',{name:'驳回这张头像'}).isDisabled()
 if(afterReload.trim()!=='食')throw new Error('刷新后头像没有保持默认：'+afterReload)
 if(!disabled)throw new Error('没有头像时驳回入口仍可点')
 await page.goto(BASE+'?demo=admin#/detail/demo-food-9',{waitUntil:'networkidle'})
 await page.waitForSelector('.author-card',{timeout:10000})
 const publicAvatar=await page.locator('.author-avatar').first().innerText()
 if(publicAvatar.trim()!=='食')throw new Error('被驳回账号的公开投稿仍显示原头像：'+publicAvatar)
 return '面板与公开投稿均回落默认头像 · 刷新后保持 · 无头像时入口禁用'
})

await check('详情页可一键导航、切换其他地图并复制坐标',async()=>{
 await page.goto(BASE+'?demo=student#/detail/demo-food-1',{waitUntil:'networkidle'})
 await page.waitForSelector('.map-card',{timeout:10000})
 // 拦掉 window.open，只记录要跳的地址，避免验收时真的弹窗。
 await page.evaluate(()=>{window.__opened=[];window.open=(url)=>{window.__opened.push(String(url));return null}})
 const cardText=await page.locator('.map-card').innerText()
 if(!/已选地点/.test(cardText))throw new Error('详情页没有显示已选地点：'+cardText.slice(0,80))
 if(!/坐标 .*\d{2}\.\d+.*\d{3}\.\d+/.test(cardText))throw new Error('详情页没有显示坐标：'+cardText.slice(0,120))
 await page.getByRole('button',{name:/导航到这里/}).click()
 const opened=await page.evaluate(()=>window.__opened)
 if(!opened.length||!/uri\.amap\.com\/marker\?position=[\d.]+,[\d.]+/.test(opened[0]))throw new Error('导航没有打开高德：'+opened[0])
 if(!/coordinate=gaode/.test(opened[0]))throw new Error('高德链接缺少 coordinate=gaode')
 await page.getByRole('button',{name:'其他地图',exact:true}).click()
 await page.waitForSelector('.map-alt',{timeout:5000})
 const alternatives=await page.locator('.map-alt button').allInnerTexts()
 for(const label of ['腾讯地图','苹果地图','百度地图','复制坐标'])if(!alternatives.includes(label))throw new Error('缺少备用入口：'+label)
 await page.getByRole('button',{name:'腾讯地图',exact:true}).click()
 const toTencent=await page.evaluate(()=>window.__opened[window.__opened.length-1])
 if(!/apis\.map\.qq\.com\/uri\/v1\/marker\?marker=coord:/.test(toTencent))throw new Error('腾讯链接不对：'+toTencent)
 await page.getByRole('button',{name:'复制坐标',exact:true}).click()
 await page.waitForFunction(()=>[...document.querySelectorAll('.detail-notice,.notice')].some(n=>/坐标/.test(n.textContent||'')),null,{timeout:8000})
 const notice=await page.locator('.detail-notice,.notice').filter({hasText:'坐标'}).first().innerText()
 if(!/坐标已复制|可长按选择坐标/.test(notice))throw new Error('复制坐标没有反馈：'+notice)
 return `高德 ${opened[0].slice(0,42)}… · 备用 ${alternatives.length} 项 · ${notice.slice(0,26)}`
})

await check('出发点弹窗支持高德链接粘贴解析并回填地点名与距离',async()=>{
 await page.goto(BASE+'?demo=student#/',{waitUntil:'networkidle'})
 await page.locator('.filter-toggle').click()
 await page.getByRole('button',{name:/设置出发点|更换出发点/}).click()
 await page.waitForSelector('.map-picker-overlay',{timeout:8000})
 const tools=await page.locator('.map-tools .chip').allInnerTexts()
 if(!tools.some(x=>/用我的位置/.test(x)))throw new Error('缺少“用我的位置”：'+tools.join('|'))
 if(!tools.some(x=>/底图 · 高德/.test(x)))throw new Error('默认底图不是高德：'+tools.join('|'))
 await page.locator('.map-advanced textarea').first().fill('https://uri.amap.com/marker?position=102.71688,25.05021&name=%E6%A5%A0%E8%8B%91%E9%A3%9F%E5%A0%82&coordinate=gaode')
 await page.getByRole('button',{name:'解析并使用',exact:true}).click()
 await page.waitForFunction(()=>/已按粘贴的位置更新选点/.test(document.body.textContent||''),null,{timeout:8000})
 const coord=await page.locator('.map-picker-overlay .map-coord').innerText()
 if(!/25\.050\d+/.test(coord)||!/102\.716\d+/.test(coord))throw new Error('粘贴后坐标不对：'+coord)
 const nameValue=await page.locator('.map-picker-card input').first().inputValue()
 if(nameValue!=='楠苑食堂')throw new Error('没有按链接回填地点名：'+nameValue)
 await page.getByRole('button',{name:'确认位置',exact:true}).click()
 await page.waitForFunction(()=>/出发点：楠苑食堂/.test(document.body.textContent||''),null,{timeout:8000})
 const notes=(await page.locator('.page p.muted, .food-row small, .food-tile small').allInnerTexts()).filter(t=>/距出发点约/.test(t))
 if(!notes.length)throw new Error('首页卡片没有显示距离提示')
 if(!notes.some(t=>/米|公里/.test(t)))throw new Error('距离文案没有单位：'+notes[0])
 return `${coord.replace(/\s+/g,' ')} · 回填「${nameValue}」 · ${notes.length} 处距离提示`
})

await check('评价昵称紧挨头像，分数贴右对齐',async()=>{
 const measure=()=>page.evaluate(()=>[...document.querySelectorAll('.review-card')].map(card=>{
  const rect=el=>el?el.getBoundingClientRect():null
  const avatar=card.querySelector('.review-avatar'),name=card.querySelector('.review-card>div>.link')||card.querySelector('div>.link'),badge=card.querySelector('.role-badge'),score=card.querySelector('em'),row=card.querySelector('div')
  return {gap:rect(name).left-rect(avatar).right,badgeGap:badge?rect(badge).left-rect(name).right:null,scoreToRight:rect(card).right-rect(score).right,rowHeight:Math.round(rect(row).height),nameHeight:Math.round(rect(name).height)}
 }))
 const detail=BASE+'?demo=admin#/detail/demo-food-1'
 await page.goto(detail,{waitUntil:'networkidle'})
 await page.waitForSelector('.review-card',{timeout:10000})
 const wide=await measure()
 if(!wide.length)throw new Error('详情页没有评价卡片')
 // 昵称曾经被“管理此评价”那种 margin-left:auto 顶到中间，这里守住间距不被撑开。
 const loose=wide.filter(x=>x.gap>12||x.gap<-1)
 if(loose.length)throw new Error('头像与昵称间距异常：'+loose.map(x=>Math.round(x.gap)+'px').join(','))
 const unaligned=wide.filter(x=>x.scoreToRight<4||x.scoreToRight>24)
 if(unaligned.length)throw new Error('分数没有贴右边：'+unaligned.map(x=>Math.round(x.scoreToRight)).join(','))
 if(wide.some(x=>x.nameHeight>30))throw new Error('昵称被挤成多行')
 await page.setViewportSize({width:320,height:844})
 await page.goto(detail,{waitUntil:'networkidle'})
 await page.waitForSelector('.review-card',{timeout:10000})
 const narrow=await measure()
 const narrowLoose=narrow.filter(x=>x.gap>12||x.gap<-1)
 if(narrowLoose.length)throw new Error('320px 下头像与昵称间距异常：'+narrowLoose.map(x=>Math.round(x.gap)+'px').join(','))
 await page.setViewportSize({width:390,height:844})
 const gaps=wide.map(x=>Math.round(x.gap))
 return `${wide.length} 条 · 390px 头像→昵称 ${Math.min(...gaps)}–${Math.max(...gaps)}px · 320px ${Math.round(narrow[0].gap)}px · 行高 ${wide[0].rowHeight}px`
})

await check('卡片缩略图拉满卡片高度，图片下方不再留白',async()=>{
 await page.setViewportSize({width:390,height:844})
 await page.goto(BASE+'?demo=student#/',{waitUntil:'networkidle'})
 await page.locator('.layout-switch button',{hasText:'卡片'}).click()
 await page.waitForSelector('.food-card',{timeout:10000})
 const cards=await page.evaluate(()=>[...document.querySelectorAll('.food-card')].map(card=>{
  const box=card.getBoundingClientRect(),media=card.querySelector('.food-media').getBoundingClientRect(),style=getComputedStyle(card)
  const innerTop=box.top+parseFloat(style.paddingTop)+parseFloat(style.borderTopWidth)
  const innerBottom=box.bottom-parseFloat(style.paddingBottom)-parseFloat(style.borderBottomWidth)
  return {width:Math.round(media.width),height:Math.round(media.height),above:Math.round(media.top-innerTop),below:Math.round(innerBottom-media.bottom),inner:Math.round(innerBottom-innerTop)}
 }))
 if(!cards.length)throw new Error('首页没有卡片')
 const gaps=cards.filter(c=>c.below>1||c.above>1)
 if(gaps.length)throw new Error('图片没有贴满卡片内高：'+gaps.map(c=>'上'+c.above+'/下'+c.below).join(','))
 if(cards.some(c=>Math.abs(c.width-88)>2))throw new Error('缩略图宽度被改动：'+cards.map(c=>c.width).join(','))
 return `${cards.length} 张卡片 · 图 ${cards[0].width}×${cards[0].height}px 与内高 ${cards[0].inner}px 对齐 · 上下留白 0`
})

await check('“只看同乡”按钮只剩一行主文案，与筛选按钮同高同排',async()=>{
 const state=await page.evaluate(()=>{
  const toggle=document.querySelector('.hometown-toggle'),filter=document.querySelector('.filter-toggle'),tools=document.querySelector('.home-tools')
  const box=el=>{const r=el.getBoundingClientRect();return {top:Math.round(r.top),height:Math.round(r.height),width:Math.round(r.width),text:(el.innerText||'').replace(/\s+/g,' ').trim(),lines:el.querySelectorAll('small').length}}
  return {toggle:box(toggle),filter:box(filter),toolsWidth:Math.round(tools.getBoundingClientRect().width),toolsHeight:Math.round(tools.getBoundingClientRect().height),scroll:document.documentElement.scrollWidth,inner:innerWidth}
 })
 if(state.toggle.lines)throw new Error('按钮里还留着副标题')
 if(!/只看同乡/.test(state.toggle.text)||state.toggle.text.replace(/[✓\s]/g,'').length!=='只看同乡'.length)throw new Error('按钮文案不对：'+state.toggle.text)
 if(state.toggle.top!==state.filter.top)throw new Error('同乡按钮与筛选按钮不在同一行')
 if(Math.abs(state.toggle.height-state.filter.height)>1)throw new Error('两个按钮不等高：'+state.toggle.height+' vs '+state.filter.height)
 if(state.toggle.height<28)throw new Error('按钮过矮，不好点：'+state.toggle.height)
 if(state.scroll>state.inner+1)throw new Error('工具行造成横向溢出')
 return `「${state.toggle.text}」${state.toggle.width}×${state.toggle.height}px · 与筛选同排 · 工具行高 ${state.toolsHeight}px`
})

await check('评价超过三条默认折叠，可展开全部再收起',async()=>{
 await page.goto(BASE+'?demo=student#/detail/demo-food-1',{waitUntil:'networkidle'})
 await page.waitForSelector('.review-card',{timeout:10000})
 const fewFolds=await page.locator('.review-fold').count()
 await page.goto(BASE+'?demo=student&reviewCase=bulk#/detail/bulk-food-000',{waitUntil:'networkidle'})
 await page.waitForSelector('.review-card',{timeout:10000})
 const folded=await page.locator('.review-card').count()
 const label=await page.locator('.review-fold').innerText()
 const total=await page.locator('.review-heading span').innerText()
 if(fewFolds!==0)throw new Error('三条以内的评价也出现了折叠条')
 if(folded!==3)throw new Error('默认没有折叠到 3 条：'+folded)
 if(!/展开全部 \d+ 条评价/.test(label))throw new Error('折叠条文案不对：'+label)
 if(await page.locator('.review-fold').getAttribute('aria-expanded')!=='false')throw new Error('折叠条初始状态不对')
 await page.locator('.review-fold').click()
 await page.waitForFunction(()=>document.querySelectorAll('.review-card').length>3,null,{timeout:5000})
 const expanded=await page.locator('.review-card').count()
 const collapseLabel=await page.locator('.review-fold').innerText()
 await page.locator('.review-fold').click()
 await page.waitForFunction(()=>document.querySelectorAll('.review-card').length===3,null,{timeout:5000})
 return `默认 ${folded} 条（${label.replace(/\s+/g,' ')}）→ 展开 ${expanded} 条（${collapseLabel.replace(/\s+/g,' ')}）→ 收起 ${folded} 条 · 合计 ${total}`
})

await check('详情页点赞只计数可取消，收藏等同“下次想吃”',async()=>{
 const detail=BASE+'?demo=student#/detail/demo-food-1'
 await page.goto(detail,{waitUntil:'networkidle'})
 await page.waitForSelector('.detail-actions',{timeout:10000})
 const read=async()=>page.evaluate(()=>{
  const like=document.querySelector('.like-action'),fav=document.querySelector('.favorite-action')
  const state=el=>({text:(el.innerText||'').replace(/\s+/g,' ').trim(),pressed:el.getAttribute('aria-pressed'),on:el.classList.contains('on'),icons:el.querySelectorAll('svg.action-icon').length})
  return {like:state(like),fav:state(fav),buttons:document.querySelectorAll('.detail-actions .button').length,blindbox:document.querySelectorAll('.detail-actions .blindbox-action').length}
 })
 const initial=await read()
 if(initial.buttons!==3)throw new Error('方框里不是三个按钮：'+initial.buttons)
 if(initial.like.icons!==1||initial.fav.icons!==1)throw new Error('按钮缺少图标')
 if(initial.like.pressed!=='false')throw new Error('点赞初始状态不是未赞')
 if(!/想吃 · 收藏/.test(initial.fav.text))throw new Error('收藏按钮没有“想吃”口径：'+initial.fav.text)
 await page.locator('.like-action').click()
 await page.waitForFunction(()=>document.querySelector('.like-action')?.getAttribute('aria-pressed')==='true',null,{timeout:8000})
 const liked=await read()
 const count=Number((liked.like.text.match(/(\d+)$/)||[])[1])
 if(!liked.like.on)throw new Error('点赞后没有高亮')
 if(count!==Number((initial.like.text.match(/(\d+)$/)||[])[1])+1)throw new Error('点赞计数没有 +1：'+initial.like.text+' → '+liked.like.text)
 await page.reload({waitUntil:'networkidle'})
 await page.waitForSelector('.like-action',{timeout:10000})
 const persisted=await read()
 if(persisted.like.pressed!=='true')throw new Error('刷新后点赞状态没有保留')
 await page.locator('.like-action').click()
 await page.waitForFunction(()=>document.querySelector('.like-action')?.getAttribute('aria-pressed')==='false',null,{timeout:8000})
 const cancelled=await read()
 const cancelledCount=Number((cancelled.like.text.match(/(\d+)$/)||[])[1])
 if(cancelledCount!==Number((initial.like.text.match(/(\d+)$/)||[])[1]))throw new Error('取消点赞没有回到原计数：'+cancelled.like.text)
 await page.locator('.favorite-action').click()
 await page.waitForFunction(()=>document.querySelector('.favorite-action')?.getAttribute('aria-pressed')==='true',null,{timeout:8000})
 const saved=await read()
 if(!/已收藏/.test(saved.fav.text)||!saved.fav.on)throw new Error('收藏后没有回显已收藏：'+saved.fav.text)
 await page.getByRole('button',{name:/再开盲盒/}).waitFor({timeout:5000})
 return `点赞 ${initial.like.text} → ${liked.like.text}（刷新后保留）→ ${cancelled.like.text} · 收藏 ${initial.fav.text} → ${saved.fav.text}`
})

await check('导出新增“全部美食”并排在前面，导出文件名与行数正确',async()=>{
 await page.goto(BASE+'?demo=student#/',{waitUntil:'networkidle'})
 const publicFoods=await page.evaluate(()=>document.querySelectorAll('.food-card').length)
 await page.goto(BASE+'?demo=student#/export',{waitUntil:'networkidle'})
 await page.waitForSelector('.export-page',{timeout:10000})
 const chips=await page.locator('.export-card').first().locator('.chips').first().locator('button').allInnerTexts()
 if(!/^全部美食/.test(chips[0]||''))throw new Error('“全部美食”没有排在最前：'+chips.join(' | '))
 if(!chips.some(t=>/我的投稿/.test(t))||!chips.some(t=>/我的收藏/.test(t)))throw new Error('原有范围被挤掉：'+chips.join(' | '))
 const allCount=Number((chips[0].match(/(\d+)$/)||[])[1])
 if(!allCount)throw new Error('全部美食数量为 0')
 await page.getByRole('button',{name:/全选当前筛选结果/}).click()
 const summary=await page.locator('.export-selection span').innerText()
 if(!new RegExp('已选 '+allCount+' / '+allCount).test(summary))throw new Error('全选没有覆盖全部美食：'+summary)
 mkdirSync('.tmpview',{recursive:true})
 const [download]=await Promise.all([page.waitForEvent('download',{timeout:20000}),page.getByRole('button',{name:/生成并下载/}).click()])
 const name=download.suggestedFilename()
 await download.saveAs('.tmpview/export-all.xlsx')
 if(!/全部美食/.test(name))throw new Error('文件名没有体现全部美食：'+name)
 const status=await page.locator('.export-page .notice').last().innerText()
 const rows=Number((status.match(/(\d+) 行/)||[])[1])
 if(rows!==allCount)throw new Error('导出行数与全选数量不一致：'+rows+' vs '+allCount)
 return `${chips.join(' | ')} · ${name} · ${rows} 行 · 首页公开 ${publicFoods} 条`
})

await check('首页可切换排布方式：点赞最多 / 最新发布 / 评分最高',async()=>{
 await page.setViewportSize({width:390,height:844})
 await page.goto(BASE+'?demo=student#/',{waitUntil:'networkidle'})
 await page.waitForSelector('.sort-row .sort-chip',{timeout:8000})
 const chips=await page.locator('.sort-row .sort-chip').allInnerTexts()
 if(chips.join('|')!=='推荐顺序|点赞最多|最新发布|评分最高')throw new Error('排布按钮不对：'+chips.join('|'))
 const names=()=>page.locator('.food-card .food-title-row strong').allInnerTexts()
 const likes=()=>page.locator('.food-card').evaluateAll(cards=>cards.map(card=>{const text=card.querySelector('.like-mini')?.textContent||'';return Number((text.match(/(\d+)/)||[])[1]||0)}))
 const defaultOrder=await names()
 await page.locator('.sort-chip').filter({hasText:'点赞最多'}).click()
 await page.waitForTimeout(200)
 const likeCounts=await likes()
 for(let i=1;i<likeCounts.length;i++)if(likeCounts[i]>likeCounts[i-1])throw new Error('点赞没有从高到低：'+likeCounts.join(','))
 await page.locator('.sort-chip').filter({hasText:'最新发布'}).click()
 await page.waitForTimeout(200)
 const newOrder=await names()
 if(newOrder[0]===defaultOrder[0])throw new Error('最新发布没有改变顺序')
 await page.locator('.sort-chip').filter({hasText:'评分最高'}).click()
 await page.waitForTimeout(200)
 const ratingOrder=await names()
 if(ratingOrder[0]!=='酸汤猪脚')throw new Error('评分最高第一条不是评分最高的投稿：'+ratingOrder[0])
 return chips.join(' / ')+' · 赞 '+likeCounts.join('>')+' · 最新 '+newOrder[0]+' · 评分 '+ratingOrder[0]
})

await check('点开互动消息的原文即自动标记已读',async()=>{
 await page.goto(BASE+'?demo=student#/messages',{waitUntil:'networkidle'})
 await page.waitForSelector('.message',{timeout:8000})
 const before=await page.locator('.read-tag.is-unread').count()
 if(!before)throw new Error('演示数据里没有未读消息')
 const tag=await page.locator('.read-tag.is-unread').first().innerText()
 await page.locator('.message.unread .message-item').first().click()
 await page.waitForTimeout(500)
 await page.goto(BASE+'?demo=student#/messages',{waitUntil:'networkidle'})
 await page.waitForSelector('.message',{timeout:8000})
 const after=await page.locator('.read-tag.is-unread').count()
 if(after>=before)throw new Error('点开后仍未标记已读：'+before+' → '+after)
 return '未读标签“'+tag+'” '+before+' → '+after
})

await check('用户侧只能查看并回复管理员私信，不能主动发起',async()=>{
 await page.goto(BASE+'?demo=student#/messages?mode=direct',{waitUntil:'networkidle'})
 await page.waitForSelector('.dm-panel',{timeout:8000})
 if(await page.locator('.dm-threads').count())throw new Error('用户侧不该出现发起对话的用户列表')
 const hint=await page.locator('.dm-panel .muted').innerText()
 if(!/只有管理员可以主动发起私信/.test(hint))throw new Error('缺少用户侧说明')
 if(!await page.locator('.dm-bubble').count())throw new Error('没有看到管理员私信')
 await page.locator('.dm-composer textarea').fill('演示环境：收到管理员私信并回复。')
 await page.getByRole('button',{name:'发送'}).click()
 await page.waitForTimeout(600)
 const last=await page.locator('.dm-bubble').last().innerText()
 if(!/收到管理员私信并回复/.test(last))throw new Error('回复没有出现：'+last)
 return '管理员私信可见 · 回复已发送'
})

await check('管理员从用户资料发起私信，并按对话查看与发送',async()=>{
 await page.goto(BASE+'?demo=admin#/messages?mode=direct',{waitUntil:'networkidle'})
 await page.waitForSelector('.dm-thread',{timeout:8000})
 const threads=await page.locator('.dm-thread').count()
 if(threads<2)throw new Error('对话列表不完整：'+threads)
 await page.locator('.dm-thread').filter({hasText:'阿岚同学'}).click()
 await page.waitForTimeout(400)
 await page.locator('.dm-composer textarea').fill('演示环境：管理员私信测试。')
 await page.getByRole('button',{name:'发送'}).click()
 await page.waitForTimeout(600)
 const own=await page.locator('.dm-bubble.me').last().innerText()
 if(!/管理员私信测试/.test(own))throw new Error('管理员消息没有显示在右侧：'+own)
 // 用户资料面板里必须能进来
 await page.goto(BASE+'?demo=admin#/admin',{waitUntil:'networkidle'})
 await page.getByRole('button',{name:'用户',exact:true}).click()
 await page.waitForSelector('.admin-person',{timeout:8000})
 await page.locator('.admin-person').filter({hasText:'阿岚同学'}).click()
 await page.getByRole('button',{name:'发私信'}).click()
 await page.waitForSelector('.dm-panel',{timeout:8000})
 if(!/mode=direct/.test(await page.evaluate(()=>location.hash)))throw new Error('没有跳到私信页')
 return threads+' 个对话 · 面板入口可用'
})

await check('全页面无横向溢出与运行时错误',async()=>{
 const pages=['?demo=student#/','?demo=student#/me','?demo=student#/export','?demo=student#/detail/demo-food-1','?demo=student#/treehole','?demo=student#/messages?mode=direct','?demo=admin#/messages?mode=direct']
 const overflow=[]
 for(const width of [320,360,390,414,768,1440]){
  await page.setViewportSize({width,height:844})
  for(const path of pages){
   await page.goto(BASE+path,{waitUntil:'networkidle'})
   const state=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,inner:innerWidth}))
   if(state.scroll>state.inner+1)overflow.push(width+'px '+path+' scroll='+state.scroll)
  }
 }
 if(overflow.length)throw new Error(overflow.slice(0,4).join(' ; '))
 if(runtimeErrors.length)throw new Error('运行时错误：'+runtimeErrors.slice(0,2).join(' | '))
 return '6 宽度 × '+pages.length+' 页面无溢出；pageerror=0'
})

await browser.close()
const summary={checkedAt:new Date().toISOString(),base:BASE,passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,consoleErrors,runtimeErrors,results}
mkdirSync('docs/evidence',{recursive:true})
writeFileSync('docs/evidence/ux-local-20261110.json',JSON.stringify(summary,null,2))
console.log('\nSUMMARY '+summary.passed+' passed / '+summary.failed+' failed · consoleErrors='+consoleErrors.length+' pageErrors='+runtimeErrors.length)
if(summary.failed)process.exitCode=1
