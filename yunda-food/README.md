# 小食云记 · 当前网页版

[公开测试](https://bboy-lan.github.io/AI/) · [CloudBase入口](https://cloud-ynnu-d6gs8ekf7dbcbe80e-1517920911.tcloudbaseapp.com/)

React + TypeScript + Vite。当前后端采用CloudBase传统文档数据库及xsyj_web_v1函数；已替换本目录原Supabase旧版实现。游客可浏览、筛选和开盲盒；邮箱注册验证后先完善昵称、头像和家乡省市，再进行投稿等操作。口味和预算可稍后选填。推荐发布必须填写名称、类别、具体地点、价格口径、辣度或甜度，并确认亲自吃过；照片、理由、地图和地点补充可留空。缺少必填项时前端拦截，服务端保留独立校验。公告通过“我已知晓”关闭，管理员可原位编辑。管理员权限由服务端独立xsyj_admins授权，不能由前端自选。三组demo参数仅在本浏览器模拟，不写真实库。

树洞现在包含黑榜避雷与同乡留言。黑榜先审后发；同乡/校园生活/吃喝吐槽可发主题、按楼层回复或引用，支持同省同市筛选、我的发帖/回复、撤回占位、举报快照和管理员带原因隐藏/恢复。消息仍从“我的”右上角互动消息查看，用户治理内进入讨论治理。家乡为自填信息，讨论是异步公开交流。价格框支持逐元按钮与长按。

[管理员讨论演示](https://bboy-lan.github.io/AI/?demo=admin#/treehole?tab=forum) · [普通用户案例](https://bboy-lan.github.io/AI/?demo=student#/me) · [空白案例](https://bboy-lan.github.io/AI/?demo=empty#/treehole?tab=forum)。演示仅写本浏览器，正式站通过登录真实参与。全功能范围和验证边界见docs/树洞讨论与全功能验收报告-20261109.md。

## 本地运行

最新集中审核台提供五类内容的标签/意见、要求修改、管理员编辑、可恢复软删除、批量部分失败、连续下一条、举报筛选及原互动消息修改入口。管理员从用户治理进入，讨论治理复用同一组件。组图支持350ms长按换序。100条隔离案例：[集中审核演示](https://bboy-lan.github.io/AI/?demo=admin&reviewCase=bulk#/review-admin)，只写本浏览器，真实管理员权限仍由服务端验证。当前验收与未实测边界见docs/集中审核与长按排序验收-20261109.md。

安装Node.js与Python后运行npm ci，复制.env.example为.env.local，仅填写浏览器publishable key，然后npm run dev。未配置环境时是明确标注的本地演示，不能当作云端部署。

## 构建与检查

npm test执行规则、源对照、数据库权限和刷新并发回归；npm run build执行类型检查及根路径生产构建。GitHub Pages子路径使用npm run build -- --base=/AI/。Vite会同时处理公共图标/示例图片子路径，哈希路由无需服务端重写。页面首轮初始化后切页复用已读取数据，后台刷新不卸载页面；写入后使缓存失效并重新读取。

## 后端

server/classic/xsyj_web_v1包含当前实际函数源码。所有xsyj_*集合禁止客户端直写，UID取自CloudBase运行时，绝不信任浏览器角色或旧微信OpenID。共用环境中的其他项目资源不能清空或覆盖。cloudbase/migrations是此前PG实现，保留作本地回归，不能对传统环境执行SQL。

管理端部署须先核对目标资源/授权，原项目维护者可运行node scripts/deploy.mjs；它固定当前已授权后端与H5静态环境。GitHub Pages gh-pages分支是构建产物，main分支保留本目录完整源码。浏览器签名链接缓存只在内存中短期保留。生产环境的域名、邮件投递、配额及费用以CloudBase控制台为准。

仓库不包含真实用户数据、私有迁移备份、管理员密钥、会话或用户密码。真实邮箱验证须由账号本人完成。公开测试中的帖子和反馈会写真实云端，请按页面提示填写。
