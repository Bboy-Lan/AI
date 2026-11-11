# 当前传统CloudBase适配

xsyj_web_v1/index.js仅从服务端运行时取UID；service.cjs开放固定业务动作，native为当前小程序业务校验的隔离副本，forum.cjs实现新增Web异步讨论。内部ownerOpenId字段存Web UID，不做旧微信映射。原12个xsyj_*集合加6个xsyj_forum_*集合，均为ADMINONLY，经函数鉴权访问；不可清理共用环境中其他应用的表、函数、认证或网站。

讨论资源初始化使用node scripts/initialize-forum.mjs，只创建明确的6个讨论集合和索引；已有集合若权限不符则拒绝覆盖。发帖/修改每日5次、回复60次、举报20次，成功重试不重复计数。旧PG迁移不能对当前NoSQL环境执行。应先盘点并备份后部署，不能以初始化为由重置全环境。

集中审核另有xsyj_review_audit（包含幂等回执）和xsyj_review_notifications两个ADMINONLY集合，使用node scripts/initialize-review.mjs建立；不复制原业务内容，不重置已有数据。moderation.cjs负责服务端权限、标签与可见性、管理员编辑、版本审计、批量逐条结果和本人通知；review-policy.cjs在作者实际写入事务中拦截旧版本/软删除绕过。

每日活跃等级与每日发布额度由 daily-activity.cjs 统一裁决：context 幂等签到写 xsyj_profiles 的 activityLastDay/activityStreak，覆写写 dailyQuotaOverride，审计写 xsyj_events（type=daily_quota_override）；submitItem 必须调用 assertQuota，不能只在前端限制。规则表 daily-level-rules.json 是前后端唯一来源，不新建集合、不迁移历史资料；取消覆写写 active:false 而不写 null。

部署源码见工程根scripts/deploy.mjs；真实验收脚本使用独立临时外部账号并精确清理。gateway-with-xsyj.rego仅是维护者当前策略参考，不得覆盖别人的或后续变更后的共享策略。
