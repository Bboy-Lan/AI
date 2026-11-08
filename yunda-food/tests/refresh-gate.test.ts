import test from 'node:test'
import assert from 'node:assert/strict'
import {createRefreshGate} from '../src/platform/refresh-gate'
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r});return {promise,resolve}}
test('切页复用新鲜数据，重复刷新合并，过期后重新读取',async()=>{
 let time=100,calls=0;const read=deferred();const gate=createRefreshGate(async()=>{calls++;if(calls===1)await read.promise},()=>time)
 const a=gate.load(),b=gate.load();assert.equal(calls,1);read.resolve();await Promise.all([a,b]);await gate.load(15000);assert.equal(calls,1)
 time+=16000;await gate.load(15000);assert.equal(calls,2)
})
test('写入发生在刷新中时不会丢失失效通知，随后再读一次',async()=>{
 let calls=0;const read=deferred();const gate=createRefreshGate(async()=>{calls++;if(calls===1)await read.promise})
 const first=gate.load();gate.invalidate();const changed=gate.load(15000),other=gate.load(15000);read.resolve();await Promise.all([first,changed,other]);assert.equal(calls,2)
 await gate.load(15000);assert.equal(calls,2)
})
test('网络失败不把失败当作新鲜缓存，下一次可恢复',async()=>{
 let calls=0;const gate=createRefreshGate(async()=>{calls++;if(calls===1)throw Error('offline')})
 await assert.rejects(()=>gate.load(),/offline/);await gate.load(15000);assert.equal(calls,2)
})
