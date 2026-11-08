import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {label,parse,same} from '../src/domain/hometown'
test('全国省市解析、同乡与简称跟冻结小程序同输入同结果',()=>{
 const module={exports:{} as {label:(v:unknown)=>string,parse:(v:unknown)=>unknown,same:(a:unknown,b:unknown)=>boolean}}
 vm.runInNewContext(readFileSync(new URL('../reference/miniapp/miniprogram/services/hometown.js',import.meta.url),'utf8'),{module})
 const values=['云南省昆明市','云南省大理白族自治州','贵州省贵阳市','广西壮族自治区南宁市','北京市','重庆市','广东省深圳市','香港特别行政区九龙','澳门特别行政区澳门半岛','台湾省台北市','随便填写','',undefined]
 for(const value of values){assert.equal(label(value),module.exports.label(value));assert.equal(JSON.stringify(parse(value)),JSON.stringify(module.exports.parse(value)));for(const other of values)assert.equal(same(value,other),module.exports.same(value,other))}
})
