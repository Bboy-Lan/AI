import assert from 'node:assert/strict'
import test from 'node:test'
import { BUDGET_MODES, defaultBudget, hometownLabel, readBudget, sameHometown, sortMessages, validBudget } from '../src/domain/rules'

test('盲盒预算保留两个口径的默认值、范围和档位', () => {
  assert.deepEqual(defaultBudget(), { mode: 'per_person', amounts: { per_person: '30', total: '50' } })
  assert.equal(BUDGET_MODES.per_person.min, 5); assert.equal(BUDGET_MODES.per_person.max, 100); assert.equal(BUDGET_MODES.per_person.step, 5)
  assert.equal(BUDGET_MODES.total.min, 50); assert.equal(BUDGET_MODES.total.max, 300); assert.equal(BUDGET_MODES.total.step, 10)
  assert.equal(validBudget('35','per_person'), true); assert.equal(validBudget('34','per_person'), false)
  assert.equal(validBudget('90','total'), true); assert.equal(validBudget('95','total'), false)
  assert.deepEqual(readBudget({ mode:'total', amounts:{per_person:'22',total:'70'} }), { mode:'total', amounts:{per_person:'30',total:'70'} })
})
test('家乡必须同省同市且展示去冗余行政后缀', () => {
  assert.equal(sameHometown('云南省昆明市','云南省昆明市'), true)
  assert.equal(sameHometown('云南省昆明市','云南省大理白族自治州'), false)
  assert.equal(hometownLabel('云南省昆明市'), '云南·昆明')
})
test('消息按未读/待处理再按时间和ID排序', () => {
  const rows = sortMessages([{_id:'b',createdAt:'2026-11-04',read:true},{_id:'a',createdAt:'2026-11-03',read:false},{_id:'c',createdAt:'2026-11-05',read:false}], 'messages')
  assert.deepEqual(rows.map(x=>x._id), ['c','a','b'])
  const feedback = sortMessages([{_id:'old',createdAt:'2026-11-06',readState:'read' as const},{_id:'new',createdAt:'2026-11-01',readState:'unread' as const}], 'feedback', true)
  assert.deepEqual(feedback.map(x=>x._id), ['new','old'])
})
