// 第十一轮本地浏览器验收：地址精简、店名层级、按钮文案、治理两栏与返回、避雷三字段。
// Run: node scripts/verify-round11-20261110.mjs
import {chromium} from 'playwright-core'

const BASE='http://127.0.0.1:5173/'
const results=[]
const runtimeErrors=[]
const consoleErrors=[]
const label='第十一轮本地验收'
function record(name,ok,detail){results.push({name,ok,detail});console.log((ok?'PASS ':'FAIL ')+name+(detail?' · '+detail:''))}
async function check(name,fn){try{const detail=await fn();record(name,true,detail)}catch(error){record(name,false,(error&&error.message)||String(error))}}
const hash=page=>decodeURIComponent(new URL(page.url()).hash)

const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']})
const context=await browser.newContext({viewport:{width:390,height:844},locale:'zh-CN',deviceScaleFactor:1})
const page=await context.newPage()
page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())})
page.on('pageerror',error=>runtimeErrors.push(String(error.message||error)))

await check('推荐发布页只留必要地址字段，图片与理由标必填',async()=>{
 await page.goto(BASE+'?demo=admin#/publish',{waitUntil:'networkidle'})
 await page.waitForSelector('.form-page',{timeout:15000})
 const text=await page.locator('.form-page').innerText()
 for(const want of ['学校','校区 / 校园范围（选填）','食堂 / 楼 / 窗口','实拍组图 · 1～3张','想推荐它的理由 · 至少10字'])if(!text.includes(want))throw new Error('缺少字段：'+want)
 for(const gone of ['地点细节补充','街道 / 摊位','具体地址补充'])if(text.includes(gone))throw new Error('仍有冗余字段：'+gone)
 const marks=await page.locator('.form-page label i').count()
 const reason=page.locator('.form-page textarea[maxlength="500"]')
 if(!await reason.count())throw new Error('找不到推荐理由输入')
 if(await reason.getAttribute('minlength')!=='10')throw new Error('推荐理由没有至少10字限制')
 return `必填标记 ${marks} 处 · 地址两段式`
})

await check('首页卡片店名缩进在美食名称下方',async()=>{
 await page.goto(BASE+'?demo=admin#/',{waitUntil:'networkidle'})
 await page.waitForSelector('.food-card',{timeout:15000})
 const card=page.locator('.food-card').filter({has:page.locator('.store-name')}).first()
 if(!await card.count())throw new Error('没有带店名的卡片')
 const box=await card.locator('.store-name').evaluate(node=>{const style=getComputedStyle(node),row=node.parentElement;return {padding:parseFloat(style.paddingLeft),border:style.borderLeftWidth,size:parseFloat(style.fontSize),titleBottom:row?.querySelector('.food-title-row')?.getBoundingClientRect().bottom||0,top:node.getBoundingClientRect().top}})
 if(box.padding<6||box.padding>14)throw new Error('店名缩进异常：'+box.padding+'px')
 if(parseFloat(box.border)<1)throw new Error('店名缺少层级线')
 if(box.top+2<box.titleBottom)throw new Error('店名没有排在美食名称下方')
 if(box.size>13)throw new Error('店名字号过大：'+box.size+'px')
 return `缩进 ${box.padding}px · 字号 ${box.size}px · 层级线 ${box.border}`
})

await check('详情地址合并去重，同一处地点不重复',async()=>{
 await page.goto(BASE+'?demo=admin#/detail/demo-food-1',{waitUntil:'networkidle'})
 await page.waitForSelector('.food-location',{timeout:15000})
 const text=(await page.locator('.food-location span').innerText()).trim()
 const parts=text.split('·').map(v=>v.trim()).filter(Boolean)
 if(parts.filter(v=>v==='云南大学').length)throw new Error('较短的学校名没有合并：'+text)
 if((text.match(/云南大学/g)||[]).length!==1)throw new Error('学校重复出现：'+text)
 if(parts.length>3)throw new Error('地点段数过多：'+text)
 return text
})

await check('按钮文案精简：导出表格、用户治理不再带待审核',async()=>{
 await page.goto(BASE+'?demo=admin#/me',{waitUntil:'networkidle'})
 const me=await page.locator('.me').innerText()
 if(!me.includes('导出表格'))throw new Error('缺少“导出表格”')
 if(me.includes('导出 Excel'))throw new Error('旧文案“导出 Excel”仍在')
 const entry=await page.locator('.me .admin-entry').first().innerText()
 if(!entry.replace(/\s+/g,'').startsWith('用户治理'))throw new Error('管理员入口文案异常：'+entry)
 if(entry.includes('待审核'))throw new Error('用户治理按钮仍带“待审核”：'+entry)
 return entry.replace(/\s+/g,' ')
})

await check('用户治理改为两栏工作台，手机端仍单列堆叠',async()=>{
 await page.setViewportSize({width:1280,height:900})
 await page.goto(BASE+'?demo=admin#/admin',{waitUntil:'networkidle'})
 await page.waitForSelector('.admin-split',{timeout:15000})
 const wide=await page.locator('.admin-split').evaluate(node=>getComputedStyle(node).gridTemplateColumns.split(' ').filter(Boolean).length)
 if(wide!==2)throw new Error('宽屏不是两栏：'+wide)
 const width=await page.locator('.app-frame').evaluate(node=>Math.round(node.getBoundingClientRect().width))
 if(width<900)throw new Error('治理页宽屏没有放宽：'+width)
 await page.locator('.admin-list-row').first().click()
 await page.waitForSelector('.admin-inspector',{timeout:8000})
 const inspector=await page.locator('.admin-inspector').innerText()
 if(!/处理|下架|审核|恢复/.test(inspector))throw new Error('右侧面板没有处理按钮：'+inspector.slice(0,40))
 await page.setViewportSize({width:390,height:844})
 await page.waitForTimeout(200)
 const narrow=await page.locator('.admin-split').evaluate(node=>getComputedStyle(node).gridTemplateColumns.split(' ').filter(Boolean).length)
 if(narrow!==1)throw new Error('手机端不是单列：'+narrow)
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1)
 if(overflow)throw new Error('手机端横向溢出')
 return `1280px 两栏(宽 ${width}px) · 390px 单列`
})

await check('从用户治理进入反馈后，返回回到用户治理',async()=>{
 await page.setViewportSize({width:390,height:844})
 await page.goto(BASE+'?demo=admin#/admin',{waitUntil:'networkidle'})
 await page.locator('.admin-entry').filter({hasText:'用户反馈'}).click()
 await page.waitForSelector('.messages',{timeout:15000})
 if(!hash(page).includes('from=admin'))throw new Error('入口没有带来源：'+hash(page))
 await page.locator('button[aria-label="返回"]').first().click()
 await page.waitForTimeout(300)
 if(!hash(page).startsWith('#/admin'))throw new Error('返回落在了：'+hash(page))
 return hash(page)
})

await check('从用户治理进入黑榜经历后，返回回到用户治理',async()=>{
 await page.goto(BASE+'?demo=admin#/tree-detail/demo-caution-1?from=admin',{waitUntil:'networkidle'})
 await page.waitForSelector('.detail',{timeout:15000})
 await page.locator('button[aria-label="返回"]').first().click()
 await page.waitForTimeout(300)
 if(!hash(page).startsWith('#/admin'))throw new Error('返回落在了：'+hash(page))
 return hash(page)
})

await check('避雷发布只填店铺、美食、具体地址，没有消费日期',async()=>{
 await page.goto(BASE+'?demo=admin#/tree-compose',{waitUntil:'networkidle'})
 await page.waitForSelector('.form-page',{timeout:15000})
 const text=await page.locator('.form-page').innerText()
 for(const want of ['店铺名称','美食名称','具体地址'])if(!text.includes(want))throw new Error('缺少字段：'+want)
 if(text.includes('消费日期'))throw new Error('仍有消费日期')
 return '店铺 / 美食 / 具体地址'
})

await check('避雷发布后卡片与详情显示美食名、缩进店名、地址和作者头像',async()=>{
 await page.goto(BASE+'?demo=admin#/tree-compose',{waitUntil:'networkidle'})
 await page.getByLabel('店铺名称').fill('示例火锅店')
 await page.getByLabel('美食名称').fill('豆米火锅')
 await page.getByLabel('具体地址').fill('云南大学东路校区旁 学府路 12 号')
 await page.getByRole('button',{name:'味道',exact:true}).click()
 await page.getByLabel('具体经历').fill('这次锅底味道偏咸，结账时价格说明和菜单不一致，请核实具体情况。')
 await page.getByRole('switch',{name:'本人亲自消费'}).click()
 await page.getByRole('button',{name:/发布消费经历|提交审核/}).click()
 await page.waitForSelector('.detail',{timeout:15000})
 const detail=await page.locator('.detail').innerText()
 if(!detail.includes('豆米火锅'))throw new Error('详情没有美食名称')
 if(!detail.includes('示例火锅店'))throw new Error('详情没有店名')
 if(!detail.includes('云南大学东路校区旁'))throw new Error('详情没有具体地址')
 if(detail.includes('消费日期'))throw new Error('详情仍显示消费日期')
 const detailStore=await page.locator('.detail .store-name').evaluate(node=>({padding:parseFloat(getComputedStyle(node).paddingLeft),font:parseFloat(getComputedStyle(node).fontSize)}))
 if(detailStore.padding<6)throw new Error('详情店名没有缩进')
 await page.goto(BASE+'?demo=admin#/treehole?tab=black',{waitUntil:'networkidle'})
 await page.waitForSelector('.caution-card',{timeout:15000})
 const card=page.locator('.caution-card').filter({hasText:'豆米火锅'}).first()
 await card.waitFor({timeout:8000})
 const body=await card.locator('.caution-body').innerText()
 if(!body.includes('示例火锅店'))throw new Error('卡片没有店名')
 if(!body.includes('云南大学东路校区旁'))throw new Error('卡片没有地址')
 const avatar=card.locator('.caution-byline img, .caution-byline span').first()
 if(!await avatar.count())throw new Error('卡片没有作者头像')
 const indent=await card.locator('.store-name').evaluate(node=>parseFloat(getComputedStyle(node).paddingLeft))
 if(indent<6)throw new Error('卡片店名没有缩进')
 return `卡片：${body.split('\n').slice(0,3).join(' / ')} · 头像已显示`
})

await check('避雷缺美食名称时无法提交',async()=>{
 await page.goto(BASE+'?demo=admin#/tree-compose',{waitUntil:'networkidle'})
 await page.getByLabel('店铺名称').fill('示例火锅店')
 await page.getByLabel('具体地址').fill('云南大学东路校区旁 学府路 12 号')
 await page.getByLabel('具体经历').fill('这次锅底味道偏咸，结账时价格说明和菜单不一致，请核实具体情况。')
 await page.getByRole('button',{name:'味道',exact:true}).click()
 await page.getByRole('switch',{name:'本人亲自消费'}).click()
 await page.getByRole('button',{name:/发布消费经历|提交审核/}).click()
 await page.waitForTimeout(400)
 if(!hash(page).includes('/tree-compose'))throw new Error('缺少美食名称仍提交成功')
 const invalid=await page.locator('input:invalid').count()
 if(invalid<1)throw new Error('美食名称没有必填校验')
 return `仍停留发布页 · ${invalid} 个必填项未完成`
})

await check('全页面无横向溢出与运行时错误',async()=>{
 const pages=['/?demo=admin#/','/?demo=admin#/treehole?tab=black','/?demo=admin#/tree-compose','/?demo=admin#/admin','/?demo=admin#/me']
 for(const width of [320,390,768,1280]){
  await page.setViewportSize({width,height:844})
  for(const path of pages){
   await page.goto(BASE+path,{waitUntil:'networkidle'})
   await page.waitForSelector('.page',{timeout:15000})
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1)
   if(overflow)throw new Error(width+'px 溢出：'+path)
  }
 }
 if(runtimeErrors.length)throw new Error('运行时错误：'+runtimeErrors.slice(0,2).join(' | '))
 return '4 宽度 × 5 页面无溢出 · pageerror=0'
})

const failed=results.filter(r=>!r.ok).length
console.log(`SUMMARY ${results.length-failed} passed / ${failed} failed · consoleErrors=${consoleErrors.length} pageErrors=${runtimeErrors.length} · ${label}`)
await browser.close()
if(failed)process.exitCode=1
