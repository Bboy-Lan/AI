// Keep the previous root build's immutable chunks so cached HTML and lazy imports survive a release.
import fs from 'node:fs'
import path from 'node:path'
const origin='https://cloud-ynnu-d6gs8ekf7dbcbe80e-1517920911.tcloudbaseapp.com'
fs.mkdirSync('.release',{recursive:true})
const response=await fetch(origin+'/?compat='+Date.now(),{signal:AbortSignal.timeout(30000)})
if(!response.ok)throw Error('Cannot inspect previous hosting build')
const html=await response.text(),pending=[...html.matchAll(/(?:src|href)="(\/assets\/[^"/]+\.(?:js|css))"/g)].map(m=>m[1]),kept=new Set()
if(!pending.some(p=>p.endsWith('.js')))throw Error('Hosting returned a warning or unknown HTML; stop before replacing resources')
fs.writeFileSync('.release/previous-root.html',html)
while(pending.length){
 const asset=pending.pop();if(kept.has(asset))continue
 if(!/^\/assets\/[\w.-]+\.(js|css)$/.test(asset))throw Error('Unexpected compatibility resource')
 const res=await fetch(origin+asset,{signal:AbortSignal.timeout(30000)})
 if(!res.ok)throw Error('Previous resource unavailable: '+asset)
 const body=Buffer.from(await res.arrayBuffer()),text=body.toString('utf8');if(/^\s*</.test(text))throw Error('Resource returned HTML')
 const target=path.join('dist',asset.slice(1));if(!fs.existsSync(target))fs.writeFileSync(target,body)
 kept.add(asset)
 for(const m of text.matchAll(/["'\x60](?:\.\/|\/assets\/)?((?:index|repository)[\w.-]*\.(?:js|css))["'\x60]/g))pending.push('/assets/'+m[1])
}
const result={origin,preserved:[...kept]};fs.writeFileSync('docs/evidence/change1-hosting-compat-20261109.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result))
