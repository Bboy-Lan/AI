import test from 'node:test'
import assert from 'node:assert/strict'
import {restoreIdentity} from '../src/platform/identity-bootstrap'
test('新用户没有会话时零云端身份请求，即使云服务不可达也能打开注册',async()=>{let calls=0;const result=await restoreIdentity(async()=>null,async()=>{calls++;throw Error('网络不可达')},{uid:null});assert.deepEqual(result,{uid:null});assert.equal(calls,0)})
test('有效会话才加载云端身份，恢复错误不降级覆盖为匿名',async()=>{let calls=0;assert.deepEqual(await restoreIdentity(async()=>({token:true}),async()=>{calls++;return{uid:'real'}},{uid:null}as{uid:string|null}),{uid:'real'});assert.equal(calls,1);await assert.rejects(()=>restoreIdentity(async()=>{throw Error('网络暂时故障')},async()=>{calls++;return{uid:'fake'}},{uid:null}as{uid:string|null}),/网络暂时故障/);assert.equal(calls,1)})
