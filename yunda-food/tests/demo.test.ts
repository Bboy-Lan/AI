import assert from 'node:assert/strict'
import test from 'node:test'
import {createDemoState} from '../src/demo/fixtures'
import {createDemoRepository,loadDemoRepository} from '../src/demo/repository'

test('讨论演示主题、同乡、楼层与消息契约对应真实接口，重复提交不建双楼',()=>{
 const r=createDemoRepository(createDemoState('admin'))
 const all=r.rpc<any>('forumTopics').rows;assert.equal(all.length,2)
 assert.equal(r.rpc<any>('forumTopics',{hometown:'云南省昆明市'}).rows.length,1)
 const p={topicId:'demo-forum-topic-1',body:'一条完整的演示楼层回复',clientRequestId:'demo-reply-request-01'}
 assert.equal(r.rpc<any>('saveForumReply',p).floor,2);assert.equal(r.rpc<any>('saveForumReply',p).floor,2)
 assert.equal(r.rpc<any>('forumTopic',{id:p.topicId}).replyCount,2)
 assert.throws(()=>r.rpc('saveForumReply',{...p,body:'同编号不同内容'}),/编号/)
 const seed=r.rpc<any[]>('messages').find(m=>m.kind==='forum_reply');assert.equal(seed.floor,1);assert.equal(seed.target_type,'forum')
})

test('讨论演示举报接入统一治理、快照、处理通知与归档',()=>{
 const r=createDemoRepository(createDemoState('admin'));r.rpc('forumTopics')
 const p={target:'topic',id:'demo-forum-topic-2',version:1,reason:'请核实广告信息',clientRequestId:'demo-report-request-01'}
 r.rpc('reportForum',p);r.rpc('reportForum',p)
 const rows=r.rpc<any[]>('adminReports').filter(v=>v.target_type==='forum');assert.equal(rows.length,1)
 assert(rows[0].snapshot.body.includes('校园生活'))
 r.rpc('adminResolveReport',{id:rows[0].id,reason:'已核实事实内容',clientRequestId:'demo-report-resolve-01'})
 assert(r.rpc<any[]>('messages').some(m=>m.kind==='forum_report'))
 r.rpc('adminReportAction',{id:rows[0].id,operation:'delete'})
 assert.equal(r.rpc<any[]>('adminReports').filter(v=>v.target_type==='forum').length,0)
})

test('讨论演示角色、发帖门槛、版本冲突和撤回占位对应真实流程',()=>{
 const r=createDemoRepository(createDemoState('student'));r.rpc('forumTopics')
 assert.throws(()=>r.rpc('adminForumList',{target:'topic'}),/管理员/)
 const topic=r.rpc<any>('forumTopic',{id:'demo-forum-topic-1'})
 assert.throws(()=>r.rpc('saveForumTopic',{id:topic.id,version:0,title:'旧版话题',body:'完整正文',category:'同乡交流',images:[],clientRequestId:'demo-topic-stale-01'}),/更新|版本/)
 const reply=r.rpc<any>('saveForumReply',{topicId:topic.id,body:'准备撤回的演示回复',clientRequestId:'demo-topic-reply-02'})
 r.rpc('withdrawForumReply',{id:reply.id,version:1});const list=r.rpc<any>('forumReplies',{id:topic.id}).rows
 assert.equal(list.at(-1).floor,2);assert.equal(list.at(-1).status,'withdrawn')
 const restricted=createDemoState('student');restricted.profiles.find(v=>v.uid===restricted.actor)!.publishing_restricted=true
 assert.throws(()=>createDemoRepository(restricted).rpc('saveForumTopic',{title:'完整标题',body:'完整正文',category:'校园生活',images:[],clientRequestId:'demo-block-request-01'}),/限制发布/)
})
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
