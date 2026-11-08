import assert from 'node:assert/strict'
import test from 'node:test'
import {createDemoState} from '../src/demo/fixtures'
import {createDemoRepository,loadDemoRepository} from '../src/demo/repository'
test('演示案例与真实服务隔离：角色、六条投稿、下架候选和按案例持久化',()=>{
 const stored=new Map<string,string>(),storage={getItem:(key:string)=>stored.get(key)||null,setItem:(key:string,value:string)=>{stored.set(key,value)}}
 const admin=loadDemoRepository('admin',storage),student=loadDemoRepository('student',storage),empty=loadDemoRepository('empty',storage)
 assert.equal(admin.rpc<any>('context').isAdmin,true);assert.equal(student.rpc<any>('context').isAdmin,false)
 assert.equal(admin.rpc<any[]>('myFoods').length,6);assert.equal(admin.rpc<any[]>('myFavorites').length,1)
 assert.equal(admin.rpc<any[]>('foods').some(f=>f.status==='hidden'),false)
 assert.equal(stored.size,0,'读取页面不写回存储，避免覆盖重置结果')
 assert.equal(empty.rpc<any[]>('myFoods').length,0);assert.equal(empty.rpc<any[]>('adminFeedback').length,0)
 assert.throws(()=>student.rpc('adminFoods'),/管理员/)
 admin.rpc('adminFoodStatus',{id:'demo-food-1',status:'hidden',reason:'演示下架操作'})
 assert.equal(loadDemoRepository('admin',storage).rpc<any[]>('foods').some(f=>f.id==='demo-food-1'),false)
 assert.equal(loadDemoRepository('student',storage).rpc<any[]>('foods').some(f=>f.id==='demo-food-1'),true)
 assert.ok([...stored.keys()].every(key=>key.startsWith('xsyj-demo:v1:')))
})
test('反馈案例可回复、已读归档，新回复重新提醒，失败保留原文',()=>{
 const repo=createDemoRepository(createDemoState('admin'))
 const before=repo.rpc<any[]>('adminFeedback').find(f=>f.id==='demo-feedback-2')
 repo.rpc('adminFeedbackAction',{id:before.id,operation:'delete'})
 assert.equal(repo.rpc<any[]>('adminFeedback').some(f=>f.id===before.id),false)
 repo.rpc('replyFeedback',{id:before.id,body:'演示补充回复',clientRequestId:'reply-request-0001'})
 assert.equal(repo.rpc<any[]>('adminFeedback').find(f=>f.id===before.id).replies.at(-1).body,'演示补充回复')
 const snapshot=repo.snapshot()
 assert.throws(()=>repo.rpc('replyFeedback',{id:before.id,body:'短'}),/回复需/)
 assert.deepEqual(repo.snapshot(),snapshot)
})
test('演示投稿、评价、收藏和审核走页面相同契约并支持重复请求',()=>{
 const repo=createDemoRepository(createDemoState('student'))
 assert.throws(()=>repo.rpc('saveReview',{id:'demo-food-1',ate:true,rating:5,text:''}),/自.*评分|自己的推荐/)
 repo.rpc('saveReview',{id:'demo-food-7',ate:true,rating:4,text:'更新演示评价'})
 assert.equal(repo.rpc<any[]>('myReviews').length,1)
 repo.rpc('favorite',{id:'demo-food-9',favorite:true});repo.rpc('favorite',{id:'demo-food-9',favorite:true})
 assert.equal(repo.rpc<any[]>('myFavorites').filter(f=>f.id==='demo-food-9').length,1)
 const payload={name:'演示新投稿',venue:'示例窗口',price:12,category:'正餐',locationType:'inside',priceBasis:'portion',taste:{spicy:1,tags:[],staple:'米线'},images:[],authorAte:true,clientRequestId:'new-food-request-0001'}
 const one=repo.rpc<any>('saveFood',payload),two=repo.rpc<any>('saveFood',payload);assert.equal(one.id,two.id)
 assert.throws(()=>repo.rpc('saveFood',{...payload,clientRequestId:'new-food-invalid',taste:{}}),/辣度/)
 const admin=createDemoRepository(createDemoState('admin'))
 admin.rpc('adminCautionStatus',{id:'demo-caution-2',version:1,status:'public',reason:'演示审核通过'})
 assert.equal(admin.rpc<any>('caution',{id:'demo-caution-2'}).status,'public')
 assert.throws(()=>admin.rpc('adminCautionStatus',{id:'demo-caution-2',version:1,status:'hidden',reason:'旧版本操作'}),/版本/)
})
