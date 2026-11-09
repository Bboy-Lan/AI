import fs from 'node:fs'
const sites=['https://bboy-lan.github.io/AI/','https://cloud-ynnu-d6gs8ekf7dbcbe80e-1517920911.tcloudbaseapp.com/'],expected=['/AI/assets/index-LRuu_61-.js','/assets/index-DSOsA2fB.js'],checks=[]
for(const site of sites){
 let html='',entry='',response
 for(let attempt=0;attempt<12;attempt++){
  response=await fetch(site,{signal:AbortSignal.timeout(20000)});html=await response.text();entry=html.match(/<script[^>]+src="([^"]+)"/)?.[1]||''
  if(response.ok&&entry===expected[sites.indexOf(site)]&&html.includes("searchParams.set('_reload'"))break
  await new Promise(r=>setTimeout(r,5000))
 }
 if(!response.ok||entry!==expected[sites.indexOf(site)]||!html.includes("searchParams.set('_reload'"))throw Error('New HTML is not live: '+site)
 const asset=await fetch(new URL(entry,site),{signal:AbortSignal.timeout(20000)}),code=await asset.text()
 if(!asset.ok||!code.includes('notice-summary')||!code.includes('向用户弹出新通知')||!code.includes('configuredPopupEnabled'))throw Error('New notice bundle is not live: '+site)
 checks.push({url:site,status:response.status,bundle:entry,bundleStatus:asset.status,newNotices:true,cacheRetry:true})
 const oldFile=site.includes('github')?'.release/previous-pages.html':'.release/previous-root.html',previous=fs.readFileSync(oldFile,'utf8'),pending=[...previous.matchAll(/(?:src|href)="([^" ]+\.(?:js|css))"/g)].map(m=>new URL(m[1],site).href),seen=new Set()
 while(pending.length){const url=pending.pop();if(seen.has(url))continue;seen.add(url);const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Cached resource broken: '+url);const code=await r.text();if(/^\s*</.test(code))throw Error('Cached resource returned HTML');checks.push({url,status:r.status,previousRelease:true});for(const m of code.matchAll(/["'\x60](?:\.\/)?((?:index|repository)[\w.-]*\.(?:js|css))["'\x60]/g))pending.push(new URL(m[1],url).href)}
}
fs.writeFileSync('docs/evidence/change1-public-bundles-20261109.json',JSON.stringify({checkedAt:new Date().toISOString(),checks},null,2));console.log(JSON.stringify({checks}))
