import assert from 'node:assert/strict'
import test from 'node:test'
import {createDemoState} from '../src/demo/fixtures'
import {createDemoRepository} from '../src/demo/repository'
import {reviewTagOf,reviewBadgeVisible} from '../src/domain/moderation'
import {reasonItems,matchScore,filterItems} from '../src/domain/discovery'

// The red badge must show the same number the administrator will find inside the review desk,
// otherwise the prompt sends people to a queue that does not match the count.
test('管理员待办数字与集中审核台的待审核数量一致，普通用户不会拿到待办数',()=>{
 const admin=createDemoRepository(createDemoState('admin'))
 const summary=admin.rpc<{unreadCount:number,pendingCount:number}>('notificationSummary')
 const review=admin.rpc<{pending:number}>('adminReviewSummary')
 const pendingReports=admin.rpc<any[]>('adminReports').filter(r=>r.status==='pending').length
 const pendingFeedback=admin.rpc<any[]>('adminFeedback').filter(r=>!r.admin_read&&!r.admin_archived).length
 assert.equal(summary.pendingCount,review.pending+pendingReports+pendingFeedback)
 assert(summary.pendingCount>0)
 const user=createDemoRepository(createDemoState('student'))
 assert.equal(user.rpc<{pendingCount:number}>('notificationSummary').pendingCount,0)
})

test('待审核与需修改只对本人或管理员可见，已审核公开内容不带徽章',()=>{
 const pending={reviewTag:'pending' as const}
 assert.equal(reviewBadgeVisible(reviewTagOf(pending),{own:true}),true)
 assert.equal(reviewBadgeVisible(reviewTagOf(pending),{own:false}),false)
 assert.equal(reviewBadgeVisible(reviewTagOf(pending),{admin:true}),true)
 assert.equal(reviewBadgeVisible(reviewTagOf({status:'public'}),{own:true}),false)
 assert.equal(reviewTagOf({status:'public'}),'approved')
})

// 管理员自己的发布默认就是已审核：服务端按运行时身份给 approved，前端不再重复标记待审。
test('管理员发布的内容默认按已审核处理',()=>{
 const admin=createDemoRepository(createDemoState('admin'))
 const saved=admin.rpc<any>('saveFood',{name:'验收：管理员免审推荐',venue:'临时窗口',price:12,category:'正餐',locationType:'inside',priceBasis:'portion',school:'云南大学',campus:'呈贡校区',taste:{spicy:1,tags:[],staple:'米线'},images:['/assets/demo/noodles.svg'],description:'管理员发布演示，推荐理由至少十个字。',authorAte:true,clientRequestId:'demo-admin-approve-01'})
 assert.equal(saved.reviewTag,'approved')
 assert.equal(reviewBadgeVisible(reviewTagOf(saved),{own:true}),false)
})

// 推荐理由从首页卡片移到详情：同一份理由只在一处展示，排序分值不受影响。
test('推荐理由按同一规则计算，可单独用于详情页',()=>{
 const prefs={hometown:'云南省昆明市',spicy:2,tags:['清淡'],staple:'米饭',budget:''}
 const item:any={name:'米线',category:'正餐',price:12,priceBasis:'portion',locationType:'inside',placeText:'云南大学',author:'同学',hometown:'云南省昆明市',tags:[],images:[],taste:{spicy:1,sweet:null,tags:['清淡'],staple:'米饭',temperature:''}}
 const reasons=reasonItems(item,prefs)
 assert.deepEqual(reasons,['同乡推荐（家乡自填）','微辣在你的接受范围','清淡符合你偏好','你常吃的米饭'])
 assert.equal(matchScore(item,prefs),13)
 const listed=filterItems([item],{},prefs)[0]
 assert.equal(listed.reasons,reasons.join(' · '))
 assert.equal(listed.orderScore,matchScore(item,prefs))
})
