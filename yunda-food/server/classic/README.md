# 当前传统CloudBase适配

xsyj_web_v1/index.js仅从服务端运行时取UID；service.cjs开放固定业务动作，native为当前小程序业务校验的隔离副本。内部ownerOpenId字段存Web UID，不做旧微信映射。需独立创建12个xsyj_*集合并设ADMINONLY，经函数鉴权访问；不可清理共用环境中其他应用的表、函数、认证或网站。

部署源码见工程根scripts/deploy.mjs；真实验收脚本使用独立临时外部账号并精确清理。gateway-with-xsyj.rego仅是维护者当前策略参考，不得覆盖别人的或后续变更后的共享策略。
