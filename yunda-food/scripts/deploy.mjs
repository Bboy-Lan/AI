import {execFileSync} from 'node:child_process'
import {createRequire} from 'node:module'
import path from 'node:path'
import fs from 'node:fs'
const require=createRequire(import.meta.url),cli=require.resolve('@cloudbase/cli/bin/tcb')
const env='cloud-yunda-d5gxrar1s14b2ee0d',hostingEnv='cloud-ynnu-d6gs8ekf7dbcbe80e'
const config=Object.fromEntries(fs.readFileSync('.env.local','utf8').trim().split(/\r?\n/).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)]}))
if(config.VITE_CLOUDBASE_ENV_ID!==env||config.VITE_CLOUDBASE_BACKEND!=='classic')throw Error('Frontend must target the approved paid traditional environment')
const call=(args,target=env)=>{const result=JSON.parse(execFileSync(process.execPath,[cli,...args,'-e',target,'--json'],{encoding:'utf8'}));if(result.error)throw Error(result.error.message);return result.data}
const detail=call(['env','detail'])
if(detail.EnvId!==env||detail.PostgreSQL?.length||detail.PackageId!=='baas_personal'||detail.Status!=='NORMAL')throw Error('Target must be the selected paid traditional environment')
execFileSync(process.execPath,[require.resolve('tsx/cli'),'--test','tests/postgres.test.ts','tests/hometown-source.test.ts','tests/repository.test.ts','tests/rules.test.ts','tests/source-parity.test.ts','tests/demo.test.ts','tests/classic.test.ts','tests/refresh-gate.test.ts','tests/form-requirements.test.ts','tests/price-step.test.ts','tests/caution-native.test.ts','tests/forum.test.ts','tests/announcement-native.test.ts','tests/moderation.test.ts','tests/feedback-flow.test.ts','tests/notice-center.test.ts','tests/session-errors.test.ts','tests/identity-bootstrap.test.ts','tests/image-policy.test.ts','tests/export-config.test.ts','tests/store-name-review.test.ts','tests/store-name-dto.test.ts','tests/image-reject.test.ts','tests/notification-counts.test.ts','tests/pending-visibility.test.ts'],{stdio:'inherit'})
execFileSync(process.execPath,[path.join(path.dirname(require.resolve('typescript/package.json')),'bin','tsc'),'-b'],{stdio:'inherit'})
execFileSync(process.execPath,[path.join(path.dirname(require.resolve('vite/package.json')),'bin','vite.js'),'build'],{stdio:'inherit'})
const integrity=JSON.parse(execFileSync('python',['scripts/verify_sources.py'],{encoding:'utf8',env:{...process.env,PYTHONIOENCODING:'utf-8'}}))
if(!integrity.ok)throw Error('Reference source integrity check failed')
execFileSync(process.execPath,['scripts/initialize-review.mjs'],{stdio:'inherit'})
call(['fn','deploy','xsyj_web_v1','--force','--install-dependency','true'])
// Retain the existing H5 origin. The paid origin hosts Lijin administration and keeps signup denied.
execFileSync(process.execPath,['scripts/prepare-hosting-release.mjs'],{stdio:'inherit'})
const result=call(['hosting','deploy','./dist','--verify'],hostingEnv)
console.log(JSON.stringify({backendEnvironment:env,hostingEnvironment:hostingEnv,verified:result.verified,url:result.url},null,2))
