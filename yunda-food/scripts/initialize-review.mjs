import {execFileSync} from 'node:child_process'
import {createRequire} from 'node:module'
import fs from 'node:fs'
const require=createRequire(import.meta.url),cli=require.resolve('@cloudbase/cli/bin/tcb'),env='cloud-yunda-d5gxrar1s14b2ee0d'
const call=args=>{let r=JSON.parse(execFileSync(process.execPath,[cli,...args,'-e',env,'--json'],{encoding:'utf8',maxBuffer:5e6}));if(r.error)throw Error(r.error.message);while(r.data&&!Array.isArray(r))r=r.data;return r}
const api=(action,body)=>call(['api','tcb',action,'--body',JSON.stringify({EnvId:env,...body})])
const target=call(['env','detail']);if(target.EnvId!==env||target.PostgreSQL?.length||target.PackageId!=='baas_personal')throw Error('Unexpected target')
const defs={xsyj_review_audit:[['recordType','kind','targetId','createdAt']],xsyj_review_notifications:[['ownerOpenId','archived','_id'],['ownerOpenId','read','archived']],xsyj_direct_messages:[['userUid','createdAt'],['fromAdmin','createdAt']]},existing=api('DescribeTables',{MgoLimit:100,MgoOffset:0}).Tables,result=[]
for(const [name,indexes]of Object.entries(defs)){
 const created=!existing.some(t=>t.TableName===name);if(created){api('CreateTable',{TableName:name});api('ModifySafeRule',{CollectionName:name,AclTag:'ADMINONLY'})}
 if(api('DescribeSafeRule',{CollectionName:name}).AclTag!=='ADMINONLY')throw Error('Refuse to overwrite non-private '+name)
 const table=api('DescribeTable',{TableName:name});for(const keys of indexes){const IndexName=keys.join('_');if(!table.Indexes.some(i=>i.Name===IndexName))api('UpdateTable',{TableName:name,CreateIndexes:[{IndexName,MgoKeySchema:{MgoIndexKeys:keys.map(Name=>({Name,Direction:Name==='createdAt'?'-1':'1'})),MgoIsUnique:false}}]})}
 result.push({name,created,acl:'ADMINONLY'});console.log(name+': ready/private')
}
fs.mkdirSync('docs/evidence',{recursive:true});fs.writeFileSync('docs/evidence/review-infrastructure-20261109.json',JSON.stringify({environment:env,collections:result,existingContentModified:false},null,2))
