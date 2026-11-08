async(page)=>{
 const base='http://127.0.0.1:5173/',tag=base.startsWith('http://127')?'local':'public',checks=[],metrics=[],errors=[],cloudCalls=[]
 const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label)}
 const error=e=>errors.push(e.message),request=r=>{if(/cloudbasegateway|tencentcloudapi|tcb-api/.test(r.url()))cloudCalls.push(r.url())}
 page.on('pageerror',error);page.on('request',request)
 const dialog=page.getByRole('dialog',{name:'选择家乡省市',exact:true}),trigger=page.locator('.hometown-trigger')
 const province=()=>dialog.locator('.hometown-steps button').first()
 const choose=async(p,c)=>{const changed=!(await province().innerText()).includes(p);await province().click();await dialog.getByRole('searchbox',{name:'搜索省份',exact:true}).fill(p);await dialog.getByRole('button',{name:p,exact:true}).click();if(changed)check(await dialog.getByRole('button',{name:'确认家乡',exact:true}).isDisabled(),'切换省份清除旧城市 '+p);await dialog.getByRole('searchbox',{name:'搜索城市',exact:true}).fill(c);await dialog.getByRole('button',{name:c,exact:true}).click()}
 let failure='',savedPrefs
 try{
  await page.goto(base+'?demo=student#/me');await page.getByRole('button',{name:'口味偏好',exact:true}).waitFor()
  savedPrefs=await page.evaluate(()=>localStorage.getItem('xsyj-preferences:demo-student'))
  await page.getByRole('button',{name:'口味偏好',exact:true}).click();await page.getByRole('heading',{name:'我的口味偏好',exact:true}).waitFor()
  check(await page.locator('select').count()===0,'口味偏好不再使用原生下拉条')
  check(await page.getByRole('button',{name:'爆辣',exact:true}).count()===1&&await page.getByRole('button',{name:'很辣',exact:true}).count()===0,'最高辣度显示爆辣')
  for(const [width,height] of [[320,568],[390,844],[1440,900],[640,360]]){
   await page.setViewportSize({width,height})
   const field=await page.locator('.hometown-field').evaluate(e=>{const label=e.querySelector('.hometown-field-label').getBoundingClientRect(),button=e.querySelector('.hometown-trigger').getBoundingClientRect();return {labelBottom:label.bottom,buttonTop:button.top,buttonHeight:button.height,overflow:document.documentElement.scrollWidth>innerWidth}})
   check(field.buttonTop>field.labelBottom&&field.buttonHeight>=44&&!field.overflow,'选择入口在文字下方且无横向溢出 '+width)
   if(width===390)await page.screenshot({path:'D:/Desktop/小食云记-新网页版/docs/evidence/hometown-'+tag+'-preferences-20261108.png'})
   await trigger.click();await dialog.waitFor()
   const metric=await dialog.evaluate(e=>{const d=e.getBoundingClientRect(),footer=e.querySelector('.hometown-picker-footer').getBoundingClientRect();return {top:d.top,bottom:d.bottom,width:d.width,viewportWidth:innerWidth,viewportHeight:innerHeight,footerBottom:footer.bottom,overflow:e.scrollWidth>e.clientWidth,optionsHeight:e.querySelector('.hometown-options').clientHeight}})
   metrics.push({width,height,...field,...metric});check(metric.top>=0&&metric.bottom<=height+1&&metric.footerBottom<=metric.bottom+1&&!metric.overflow&&metric.optionsHeight>=44,'面板与确认按钮完整可见 '+width+'x'+height)
   if(width===390)await page.screenshot({path:'D:/Desktop/小食云记-新网页版/docs/evidence/hometown-'+tag+'-picker-20261108.png'})
   await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});check(await trigger.evaluate(e=>e===document.activeElement),'Esc取消并恢复入口焦点 '+width)
  }
  await page.setViewportSize({width:390,height:844});const original=await trigger.innerText();await trigger.click();await choose('贵州省','贵阳市')
  check(await trigger.innerText()===original,'确认前不会覆盖表单已有家乡')
  await dialog.getByRole('button',{name:'取消',exact:true}).click();check(await trigger.innerText()===original,'取消保留原省市')
  await trigger.click();await province().click();await dialog.getByRole('searchbox',{name:'搜索省份',exact:true}).fill('不存在的省份');check(await dialog.getByText('没有找到省份，试试其他名称。',{exact:true}).isVisible(),'搜索无结果可恢复')
  await page.keyboard.press('Enter');check(await dialog.isVisible()&&page.url().includes('onboarding'),'搜索回车不提交外层表单')
  await choose('北京市','北京市');await dialog.getByRole('button',{name:'确认家乡',exact:true}).click();check((await trigger.innerText()).replace(/\s/g,'')==='北京市⌄','直辖市不重复显示名称')
  await trigger.click();await choose('香港特别行政区','香港岛');await dialog.getByRole('button',{name:'确认家乡',exact:true}).click();check((await trigger.innerText()).includes('香港岛'),'港澳城市仍可选择')
  await trigger.click();await choose('云南省','西双版纳傣族自治州');await dialog.getByRole('button',{name:'确认家乡',exact:true}).click();check(await trigger.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'长城市名称不溢出')
  await page.getByRole('button',{name:'爆辣',exact:true}).click();await page.getByRole('button',{name:'保存口味偏好',exact:true}).click();await page.getByRole('button',{name:'口味偏好',exact:true}).waitFor();await page.getByRole('button',{name:'口味偏好',exact:true}).click();check((await trigger.innerText()).includes('西双版纳傣族自治州')&&await page.getByRole('button',{name:'爆辣',exact:true}).evaluate(e=>e.classList.contains('active')),'确认省市与爆辣保存后再进入仍保留')
  await page.getByRole('button',{name:'返回',exact:true}).click();await page.getByRole('button',{name:'编辑资料',exact:true}).click();await page.getByRole('heading',{name:'完善资料',exact:true}).waitFor();check(await page.locator('select').count()===0,'完善资料同步复用省市面板')
  await page.getByLabel('昵称',{exact:true}).fill('未提交的昵称');await trigger.click();await choose('云南省','普洱市');await dialog.getByRole('button',{name:'确认家乡',exact:true}).click();check(await page.getByLabel('昵称',{exact:true}).inputValue()==='未提交的昵称'&&page.url().endsWith('#/onboarding'),'选择确认不会提交资料或丢失昵称')
  check(cloudCalls.length===0,'演示检查未访问真实云端');check(errors.length===0,'无页面运行时错误')
 }catch(e){failure=e.message;await page.screenshot({path:'D:/Desktop/小食云记-新网页版/docs/evidence/hometown-'+tag+'-failure-20261108.png'}).catch(()=>{})}finally{
  if(savedPrefs!==undefined)await page.evaluate(value=>{if(value===null)localStorage.removeItem('xsyj-preferences:demo-student');else localStorage.setItem('xsyj-preferences:demo-student',value)},savedPrefs)
  page.off('pageerror',error);page.off('request',request)
 }
 return {base,checks,metrics,errors,cloudCalls,failure}
}
