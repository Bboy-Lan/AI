import test from 'node:test'
import assert from 'node:assert/strict'
import {stepPrice} from '../src/domain/price-step'
test('每次调整1元且保留手填小数，不产生浮点累积误差',()=>{
 assert.equal(stepPrice(15.12,1),16.12);assert.equal(stepPrice(15.12,-1),14.12)
 assert.equal(stepPrice(.29,1),1.29)
 let price:number|undefined=15.12
 for(let i=0;i<100;i++)price=stepPrice(price,1)
 for(let i=0;i<100;i++)price=stepPrice(price,-1)
 assert.equal(price,15.12)
})
test('空值可从1元开始，边界不越界或偷偷变成小于1元的步长',()=>{
 assert.equal(stepPrice(undefined,1),1);assert.equal(stepPrice(undefined,-1),undefined)
 assert.equal(stepPrice(.01,-1),.01);assert.equal(stepPrice(.5,-1),.5)
 assert.equal(stepPrice(998.99,1),999.99);assert.equal(stepPrice(999.99,1),999.99)
 assert.equal(stepPrice(999.5,1),999.5)
})
