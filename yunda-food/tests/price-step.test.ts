import test from 'node:test'
import assert from 'node:assert/strict'
import {stepPrice,integerPrice} from '../src/domain/price-step'
test('价格始终为整数，历史小数四舍五入后逐元调整',()=>{assert.equal(integerPrice(15.12),15);assert.equal(integerPrice(15.8),16);assert.equal(stepPrice(15,1),16);assert.equal(stepPrice(15,-1),14);assert.equal(stepPrice(15.12,1),16);let p:number|undefined=15;for(let i=0;i<100;i++)p=stepPrice(p,1);for(let i=0;i<100;i++)p=stepPrice(p,-1);assert.equal(p,15)})
test('整数价格限定1～999，空值与极限长按不会越界',()=>{assert.equal(stepPrice(undefined,1),1);assert.equal(stepPrice(undefined,-1),undefined);assert.equal(stepPrice(1,-1),1);assert.equal(stepPrice(999,1),999);assert.equal(integerPrice(.29),1);assert.equal(integerPrice(999.99),999);assert.equal(integerPrice(NaN),undefined)})
