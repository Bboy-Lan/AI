async(page)=>{
 const base='http://127.0.0.1:5173/',tag=base.startsWith('http://127')?'local':'public',checks=[],metrics=[],errors=[],cloudCalls=[]
 const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label)},error=e=>errors.push(e.message),request=r=>{if(/cloudbasegateway|tencentcloudapi|tcb-api/.test(r.url()))cloudCalls.push(r.url())}
 page.on('pageerror',error);page.on('request',request)
 const nav=async(route)=>{await page.goto(base+'?demo=admin#/'+route);await page.locator('main').waitFor()}
 const shot=async(name)=>page.screenshot({path:'D:/Desktop/小食云记-新网页版/docs/evidence/spacing-'+tag+'-'+name+'-20261108.png'})
 let failure='',backup
 try{
  await nav('me');backup=await page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('xsyj-demo:v1:')||k.startsWith('xsyj-draft:demo-admin:')).map(k=>[k,localStorage.getItem(k)])))
  await page.evaluate(()=>{localStorage.removeItem('xsyj-draft:demo-admin:new')})
  for(const width of [320,390,1440]){
   await page.setViewportSize({width,height:844});await nav('me')
   const profile=await page.locator('.profile-heading').evaluate(e=>({height:e.getBoundingClientRect().height,overflow:e.scrollWidth>e.clientWidth}));check(profile.height>=110&&!profile.overflow,'资料顶部拉高且不溢出 '+width);metrics.push({width,profile});if(width===390)await shot('me')
   await nav('publish');await page.getByLabel('添加照片',{exact:true}).waitFor()
   const upload=await page.locator('.gallery-upload').evaluate(e=>{const label=e.querySelector('.upload').getBoundingClientRect(),title=e.querySelector('.upload-title'),hint=e.querySelector('.upload-help').getBoundingClientRect();return {height:label.height,width:label.width,titleWrap:title.getBoundingClientRect().height>30,hintBelow:hint.top>=label.bottom,overflow:e.scrollWidth>e.clientWidth}})
   check(upload.height>=88&&!upload.titleWrap&&upload.hintBelow&&!upload.overflow,'图片入口加大且说明独立在下方 '+width);metrics.push({width,upload});if(width===390){await page.locator('.recommendation-media').scrollIntoViewIfNeeded();await shot('upload')}
   await nav('');await page.getByRole('button',{name:'公告',exact:true}).click();const modal=page.getByRole('dialog',{name:'公告',exact:true});await modal.waitFor()
   check(await modal.getByRole('button',{name:'关闭公告',exact:true}).count()===0,'公告无右上角关闭键 '+width)
   await page.keyboard.press('Escape');check(await modal.isVisible(),'Esc不绕过公告知晓 '+width)
   const m=await modal.locator('.announcement-modal-card').evaluate(e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,width:r.width,overflow:e.scrollWidth>e.clientWidth}});check(m.top>=0&&m.bottom<=844&&!m.overflow,'公告阅读面板完整无溢出 '+width);metrics.push({width,announcement:m});if(width===390)await shot('announcement')
   await modal.getByRole('button',{name:'编辑公告',exact:true}).click();const edit=await modal.locator('.announcement-content-input').evaluate(e=>({height:e.getBoundingClientRect().height,lineHeight:getComputedStyle(e).lineHeight}));check(edit.height>=220,'公告编辑区域更宽松 '+width);metrics.push({width,edit});if(width===390)await shot('announcement-edit')
   await modal.getByRole('button',{name:'取消编辑',exact:true}).click();await modal.getByRole('button',{name:'我已知晓！',exact:true}).click();await modal.waitFor({state:'hidden'})
  }
  await page.setViewportSize({width:390,height:844});await nav('publish');const submit=page.getByRole('button',{name:'发布实吃推荐',exact:true})
  await submit.click();check(page.url().endsWith('#/publish')&&await page.locator('input:invalid').count()>0,'空名称地点价格不能发布')
  await page.getByLabel('食物 / 饮品名称').fill('必填验收米线');await page.getByLabel('食堂 / 楼 / 窗口').fill('楠苑一楼米线窗口');await page.getByLabel('价格 · 元').fill('12');await submit.click();await page.getByRole('status').filter({hasText:'请选择这份食物的辣度。'}).waitFor();check(page.url().endsWith('#/publish'),'缺辣度不能发布')
  await page.getByRole('button',{name:'不辣',exact:true}).click();await submit.click();await page.getByRole('status').filter({hasText:'请确认你已亲自吃过这份推荐。'}).waitFor();check(page.url().endsWith('#/publish'),'未确认亲自吃过不能发布')
  await page.getByRole('switch',{name:'亲自吃过',exact:true}).click();await submit.click();await page.getByRole('heading',{name:'必填验收米线',exact:true}).waitFor();check(page.url().includes('#/detail/'),'只填必要信息即可发布，无需照片理由地图')
  await nav('publish');await page.getByLabel('添加照片',{exact:true}).setInputFiles(['D:/Desktop/小食云记-新网页版/public/assets/icons/avatar.png','D:/Desktop/小食云记-新网页版/public/assets/icons/default-goods-image.png','D:/Desktop/小食云记-新网页版/public/assets/icons/hero-lavender-clocktower.jpg']);await page.getByText('3/3 张',{exact:true}).waitFor();check(await page.locator('.photo-grid .photo-tile').count()===3,'三张图片可添加且数量正确');await page.getByRole('button',{name:'放大第1张照片',exact:true}).click();await page.getByRole('dialog',{name:'照片预览',exact:true}).waitFor();await page.getByRole('button',{name:'关闭 ×',exact:true}).click();check(true,'照片仍可放大查看')
  await nav('onboarding');await page.getByLabel('昵称',{exact:true}).fill('');await page.getByRole('button',{name:'保存资料',exact:true}).click();check(page.url().endsWith('#/onboarding')&&await page.getByLabel('昵称',{exact:true}).evaluate(e=>!e.validity.valid),'缺昵称不能保存进入下一步');await page.getByLabel('昵称',{exact:true}).fill('验收同学');await page.getByRole('button',{name:'清空家乡',exact:true}).click();await page.getByRole('button',{name:'保存资料',exact:true}).click();await page.getByRole('alert').filter({hasText:'请选择完整的家乡省份和城市。'}).waitFor();check(page.url().endsWith('#/onboarding'),'缺省市不能保存进入下一步')
  await nav('');await page.getByRole('button',{name:'公告',exact:true}).click();const modal=page.getByRole('dialog',{name:'公告',exact:true});await modal.getByRole('button',{name:'编辑公告',exact:true}).click();await page.getByLabel('标题 · 最多20字').fill('公告排版验收');await page.getByLabel('正文 · 最多260字、6段').fill(Array.from({length:6},(_,i)=>'第'+(i+1)+'段说明：分享真实的美食体验，价格与地点请以现场为准，共同维护社区。').join('\n'));await modal.getByRole('button',{name:'保存新版公告',exact:true}).click();await modal.getByRole('heading',{name:'公告排版验收',exact:true}).waitFor();check(await modal.locator('.announcement-modal-body p').count()===6,'管理员保存后按六段清晰展示');await page.getByRole('button',{name:'我已知晓！',exact:true}).click()
  check(cloudCalls.length===0,'演示验收不访问真实云端');check(errors.length===0,'无页面运行时错误')
 }catch(e){failure=e.message;await shot('failure').catch(()=>{})}finally{
  if(backup)await page.evaluate(original=>{for(const key of Object.keys(localStorage))if(key.startsWith('xsyj-demo:v1:')||key.startsWith('xsyj-draft:demo-admin:'))localStorage.removeItem(key);for(const [key,value]of Object.entries(original))localStorage.setItem(key,value)},backup)
  page.off('pageerror',error);page.off('request',request)
 }
 return {base,checks,metrics,errors,cloudCalls,failure}
}
