import {execFileSync} from 'node:child_process'
import {createRequire} from 'node:module'
import fs from 'node:fs'
import crypto from 'node:crypto'
const require=createRequire(import.meta.url)
const config=Object.fromEntries(fs.readFileSync('.env.local','utf8').trim().split(/\r?\n/).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)]}))
const env=config.VITE_CLOUDBASE_ENV_ID
if(!['cloud-ynnu-d6gs8ekf7dbcbe80e','cloud-yunda-d5gxrar1s14b2ee0d'].includes(env))throw Error('Unapproved target')
const cli=require.resolve('@cloudbase/cli/bin/tcb')
const uid=process.argv[2]
if(!uid||! /^[a-zA-Z0-9_-]{8,128}$/.test(uid))throw Error('Provide the verified CloudBase application user UID, not a Tencent Cloud account ID.')
const call=args=>JSON.parse(execFileSync(process.execPath,[cli,...args,'-e',env,'--json'],{encoding:'utf8'}))
const users=call(['user','list','--uids',uid])
if(!Array.isArray(users.data)||!users.data.some(user=>user.Uid===uid&&user.UserStatus==='ACTIVE'))throw Error('Active user UID was not found in the selected environment.')
if(config.VITE_CLOUDBASE_BACKEND==='classic'){
 if(env!=='cloud-yunda-d5gxrar1s14b2ee0d')throw Error('Wrong classic target')
 const id=crypto.createHash('sha256').update('web-admin:'+uid).digest('hex').slice(0,32)
 const command=[{TableName:'xsyj_admins',CommandType:'UPDATE',Command:JSON.stringify({update:'xsyj_admins',updates:[{q:{_id:id},u:{$set:{openId:uid,enabled:true}},upsert:true}]})}]
 const result=call(['db','nosql','execute','--command',JSON.stringify(command)])
 if(result.error)throw Error(result.error.message)
 console.log(JSON.stringify({env,adminGranted:true,scope:'xsyj_admins only'}));process.exit(0)
}
// Only the account owner runs this management-plane operation; no browser endpoint.
const sql=`INSERT INTO public.xsyj_admins(uid) VALUES('${uid}') ON CONFLICT(uid) DO UPDATE SET enabled=true; SELECT uid,enabled FROM public.xsyj_admins WHERE uid='${uid}'`
const result=call(['db','execute','--sql',sql])
console.log(JSON.stringify({env,adminGranted:!result.error,requestId:result.data?.RequestId}))
