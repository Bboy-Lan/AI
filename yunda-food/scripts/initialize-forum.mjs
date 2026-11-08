import {execFileSync} from 'node:child_process'
import {createRequire} from 'node:module'
import fs from 'node:fs'
const require=createRequire(import.meta.url),cli=require.resolve('@cloudbase/cli/bin/tcb'),env='cloud-yunda-d5gxrar1s14b2ee0d'
const call=args=>{let r=JSON.parse(execFileSync(process.execPath,[cli,...args,'-e',env,'--json'],{encoding:'utf8',maxBuffer:5e6}));if(r.error)throw Error(r.error.message);while(r.data&&!Array.isArray(r))r=r.data;return r}
const api=(action,body)=>call(['api','tcb',action,'--body',JSON.stringify({EnvId:env,...body})])
const detail=call(['env','detail']);if(detail.EnvId!==env||detail.PostgreSQL?.length||detail.PackageId!=='baas_personal')throw Error('Expected approved paid traditional environment')
const definitions={topics:[['status','sequence'],['status','hometown','sequence'],['ownerOpenId','sequence']],replies:[['topicId','floor'],['ownerOpenId','sequence'],['status','sequence']],reports:[['status','sequence'],['status','archived','sequence']],notifications:[['ownerOpenId','archived','sequence'],['ownerOpenId','archived','read','sequence']],meta:[],audit:[['topicId','createdAt']]}
const existing=api('DescribeTables',{MgoLimit:100,MgoOffset:0}).Tables,result=[]
for(const [suffix,indexes]of Object.entries(definitions)){
 const name='xsyj_forum_'+suffix;if(!name.startsWith('xsyj_forum_'))throw Error('Unexpected table')
 const created=!existing.some(t=>t.TableName===name)
 if(created){api('CreateTable',{TableName:name});api('ModifySafeRule',{CollectionName:name,AclTag:'ADMINONLY'})}
 const rule=api('DescribeSafeRule',{CollectionName:name});if(rule.AclTag!=='ADMINONLY')throw Error('Existing table is not private; refuse to overwrite '+name)
 const info=api('DescribeTable',{TableName:name})
 for(const keys of indexes){const IndexName=keys.join('_');if(!info.Indexes.some(i=>i.Name===IndexName))api('UpdateTable',{TableName:name,CreateIndexes:[{IndexName,MgoKeySchema:{MgoIndexKeys:keys.map(Name=>({Name,Direction:Name==='sequence'||Name==='createdAt'?'-1':'1'})),MgoIsUnique:false}}]})}
 result.push({name,created,acl:rule.AclTag,indexes:indexes.length});console.log(name+': ready/private')
}
fs.mkdirSync('docs/evidence',{recursive:true});fs.writeFileSync('docs/evidence/forum-infrastructure-20261108.json',JSON.stringify({environment:env,collections:result,otherCollectionsModified:false},null,2))
