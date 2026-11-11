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

test('互动消息支持全部已读，并做成左右两栏大屏 + 紧凑行',()=>{
  const pages=read('src/pages/GovernancePages.tsx'),css=read('src/styles/app.css')
  assert.ok(pages.includes('markAllRead'),'缺少一键已读逻辑')
  assert.ok(pages.includes('全部已读'),'缺少全部已读按钮')
  assert.ok(pages.includes('msg-split'),'消息页应为左右两栏大屏布局')
  assert.ok(pages.includes('selectedId'),'应有选中态详情面板')
  assert.match(css,/\.msg-row\{[^}]*padding:8px 10px/,'消息行应紧凑')
  assert.match(css,/\.msg-split\{[^}]*display:grid/,'消息页应为网格分栏')
  assert.match(css,/@media\(min-width:900px\)\{\.app-frame\.msg-workspace\{max-width:980px/,'大屏应加宽到 980')
})

test('私信页为左右两栏，手机端可切换会话',()=>{
  const dm=read('src/components/DirectMessages.tsx'),css=read('src/styles/app.css')
  assert.ok(dm.includes('dm-split'),'私信应为左右两栏')
  assert.ok(dm.includes('dm-list-pane')&&dm.includes('dm-chat-pane'),'缺少列表/聊天分栏')
  assert.ok(dm.includes('chatOpen')&&dm.includes('dm-back'),'手机端应可返回会话列表')
  assert.match(css,/\.dm-split\{[^}]*display:grid/)
  assert.match(css,/@media\(min-width:900px\)\{\.dm-split\{grid-template-columns/)
})
