import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=(file:string)=>readFileSync(file,'utf8')

test('编辑重提交按 id 更新，避免因缓存未命中而重复新建',()=>{
  const repo=read('src/services/repository.ts'),compose=read('src/pages/CloudCompose.tsx'),app=read('src/app/App.tsx')
  assert.match(repo,/const exists=Boolean\(food\.id\)\|\|foods\.some/,'带 id 的草稿必须更新而不是新建')
  assert.ok(compose.includes("isAdmin?'保存修改':'提交审核'"),'编辑按钮应明确为提交审核')
  assert.ok(compose.includes('reviewVersion:food.reviewVersion'),'载入草稿时应用服务端最新审核版本，避免误报“内容已有审核更新”')
  assert.ok(app.includes("food.reviewTag==='pending'"),'详情页应提示修改待审核')
})

test('互动消息支持全部已读并压缩行高',()=>{
  const pages=read('src/pages/GovernancePages.tsx'),css=read('src/styles/app.css')
  assert.ok(pages.includes('markAllRead'),'缺少一键已读逻辑')
  assert.ok(pages.includes('全部已读'),'缺少全部已读按钮')
  assert.match(css,/\.messages \.message\{[^}]*padding:10px 12px/,'消息卡应更紧凑')
  assert.match(css,/\.messages \.message>p:not\(\.notice\)\{[^}]*-webkit-line-clamp:2/,'消息正文应两行截断')
  assert.match(css,/\.messages \.message \.message-item\{[^}]*display:inline-flex/,'查看原帖按钮应内联变小')
})
