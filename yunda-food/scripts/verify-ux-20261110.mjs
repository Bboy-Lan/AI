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

await check('管理员可单张驳回配图，作者编辑页出现驳回占位并要求重传',async()=>{
 await page.goto(BASE+'?demo=admin#/review-admin',{waitUntil:'networkidle'})
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
 await page.waitForSelector('.admin-record',{timeout:10000})
 await page.locator('.admin-record').filter({hasText:'阿岚同学'}).first().locator('.managed-food').click()
 await page.waitForSelector('.profile-panel header.profile',{timeout:8000})
 await page.locator('.profile-panel textarea').fill('验收：头像含不适内容，请重新上传。')
 await page.getByRole('button',{name:'驳回这张头像'}).click()
 await page.waitForFunction(()=>[...document.querySelectorAll('.profile-panel .notice')].some(n=>/驳回/.test(n.textContent||'')),null,{timeout:10000})
 const panelAvatar=await page.locator('.profile-panel header.profile .avatar').first().innerText()
 if(panelAvatar.trim()!=='食')throw new Error('面板内没有回落到默认头像：'+panelAvatar)
 await page.reload({waitUntil:'networkidle'})
 await page.getByRole('button',{name:'用户',exact:true}).click()
 await page.locator('.admin-record').filter({hasText:'阿岚同学'}).first().locator('.managed-food').click()
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

await check('全页面无横向溢出与运行时错误',async()=>{
 const pages=['?demo=student#/','?demo=student#/me','?demo=student#/export','?demo=student#/detail/demo-food-1','?demo=student#/treehole']
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
 return '6 宽度 × 5 页面无溢出；pageerror=0'
})

await browser.close()
const summary={checkedAt:new Date().toISOString(),base:BASE,passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,consoleErrors,runtimeErrors,results}
mkdirSync('docs/evidence',{recursive:true})
writeFileSync('docs/evidence/ux-local-20261110.json',JSON.stringify(summary,null,2))
console.log('\nSUMMARY '+summary.passed+' passed / '+summary.failed+' failed · consoleErrors='+consoleErrors.length+' pageErrors='+runtimeErrors.length)
if(summary.failed)process.exitCode=1
