"""Prepare only the authorized public source subtree; never copy private working files."""
from pathlib import Path
import shutil,json,hashlib,re,subprocess
root=Path.cwd().resolve()
repo=(root/'.release/github-ai').resolve()
assert repo.parent==root/'.release' and (repo/'.git').is_dir()
target=(repo/'yunda-food').resolve()
assert target.parent==repo and target.name=='yunda-food'
if target.exists():shutil.rmtree(target)
target.mkdir()
for folder in ['src','public','tests','server/classic','cloudbase/migrations']:
    source=root/folder
    shutil.copytree(source,target/folder,ignore=shutil.ignore_patterns('node_modules','*.tsbuildinfo'))
for name in ['package.json','package-lock.json','index.html','tsconfig.json','vite.config.ts','cloudbaserc.json']:
    shutil.copy2(root/name,target/name)
scripts=['deploy.mjs','grant_admin.mjs','initialize-forum.mjs','verify-classic-cloud.mjs','verify-forum-ui-20261109.js','verify-forum-boundaries-20261109.js','verify-business-ui-20261109.js','verify-pages-20261109.js','verify-price-governance-20261108.js','verify-spacing-required-20261108.js','verify-hometown-picker-20261108.js','verify_targeted_20261108.js']
scripts+=['verify-first-entry-ui-20261109.js','verify-session-ui-20261109.js','verify-notices-ui-20261109.js','verify-session-account.mjs','verify-identity-feedback-ui-20261109.js','initialize-review.mjs','verify-review-ui-20261109.js','verify-review-extra-ui-20261109.js']
scripts+=['verify-change1-ui-20261109.js','verify-change1-access-20261109.js','verify-change1-session-20261109.js','verify-change1-bundles.mjs','prepare-hosting-release.mjs','prepare-pages-release.py']
scripts+=['verify-ux-20261110.mjs','verify-ux-cloud-20261110.mjs','verify-ux-public-20261110.mjs','verify-round11-20261110.mjs','approve-admin-pending.mjs','verify-daily-level-ui.mjs','verify-daily-level-cloud.mjs','verify-daily-level-public.mjs']
for name in scripts:
    (target/'scripts').mkdir(exist_ok=True)
    shutil.copy2(root/'scripts'/name,target/'scripts'/name)
for name in ['树洞讨论方案与全功能测试矩阵-20261108.md','树洞讨论与全功能验收报告-20261109.md','集中审核与长按排序验收-20261109.md','帖子身份与问题反馈验收-20261109.md','整数价格与多公告登录保持-20261109.md','公告简化与访问稳定性验收-20261109.md','稳定访问与独立域名方案-20261109.md','图片兼容与使用体验整改-20261110.md','图片驳回与评分呈现-20261110.md','待审核可见与角标提醒-20261110.md','定位与导航-20261110.md','管理员免审与自提醒-20261110.md','互动体验与点赞导出-20261110.md','互动消息与私信-20261110.md','发布精简与治理版面-20261110.md','每日活跃等级与发布额度-20261111.md','SESSION_STATE.md']:
    (target/'docs').mkdir(exist_ok=True)
    shutil.copy2(root/'docs'/name,target/'docs'/name)
proofs=['forum-ui-local-20261109.json','forum-boundaries-local-20261109.json','business-ui-local-20261109.json','pages-ui-local-20261109.json','classic-cloud-20261108.json','forum-infrastructure-20261108.json','forum-local-thread-20261109.png']
proofs+=['forum-ui-public-20261109.json','boundaries-ui-public-20261109.json','business-ui-public-20261109.json','pages-ui-public-20261109.json','public-login-forum-20261109.json','public-forum-bundles-20261109.json']
proofs+=['regression-verify-price-governance-20261108-20261109.json','regression-verify-spacing-required-20261108-20261109.json','regression-verify-hometown-picker-20261108-20261109.json','regression-verify_targeted_20261108-20261109.json']
proofs+=['review-ui-local-20261109.json','review-extra-ui-local-20261109.json','review-touch-local-20261109.json','review-next-local-20261109.json','review-regression-pages-local-20261109.json','review-regression-business-local-20261109.json','review-cloud-20261109.json','review-infrastructure-20261109.json','review-local-desktop-final-20261109.png']
proofs+=['review-ui-public-20261109.json','review-extra-ui-public-20261109.json','review-pages-ui-public-20261109.json','public-review-bundles-20261109.json']
proofs+=['review-root-smoke-20261109.json']
proofs+=['identity-ui-local-20261109.json','identity-pages-local-20261109.json','identity-business-local-20261109.json','identity-review-local-20261109.json','identity-ui-public-20261109.json','identity-pages-public-20261109.json','identity-cloud-final-20261109.json','identity-root-smoke-20261109.json','identity-feedback-final-20261109.png','identity-preservation-20261109.json','public-identity-bundles-20261109.json']
proofs+=['notices-ui-local-20261109.json','notices-pages-local-20261109.json','notices-ui-public-20261109.json','notices-pages-public-20261109.json','notices-business-public-20261109.json','notices-cloud-final-20261109.json','notices-preservation-20261109.json','session-start-local-20261109.json','session-onboarding-local-20261109.json','session-persistence-local-20261109.json','public-notices-bundles-20261109.json','notices-final-editor-20261109.png','first-entry-local-20261109.json','first-entry-public-20261109.json','session-lazy-final-local-20261109.json']
(target/'docs/evidence').mkdir(exist_ok=True)
proofs+=[p.name for p in (root/'docs/evidence').glob('change1-*') if p.suffix in ['.json','.png']]
proofs+=[p.name for p in (root/'docs/evidence').glob('ux-*') if p.suffix in ['.json','.png']]
proofs+=[p.name for p in (root/'docs/evidence').glob('daily-level-*') if p.suffix in ['.json','.png']]
for name in proofs:
    shutil.copy2(root/'docs/evidence'/name,target/'docs/evidence'/name)
# Freeze only pure-rule dependencies required by the source parity tests.
queue=['discovery.js','hometown.js','taste-tags.js','detail-presentation.js','message-order.js'];copied=set()
while queue:
    name=queue.pop()
    if name in copied:continue
    source=root/'reference/miniapp/miniprogram/services'/name
    content=source.read_text(encoding='utf-8')
    dest=target/'reference/miniapp/miniprogram/services'/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(content,encoding='utf-8')
    copied.add(name)
    queue.extend(m+'.js' for m in re.findall(r"require\(['\"]\./([^'\"]+)['\"]\)",content) if (root/'reference/miniapp/miniprogram/services'/(m+'.js')).exists())
manifest={p.relative_to(target).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in (target/'reference').rglob('*.js')}
(target/'reference/public-baseline.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
(target/'scripts/verify_sources.py').write_text('''from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parent.parent
manifest=json.loads((root/'reference/public-baseline.json').read_text(encoding='utf-8'))
changed=[p for p,h in manifest.items() if not (root/p).is_file() or hashlib.sha256((root/p).read_bytes()).hexdigest()!=h]
print(json.dumps({'ok':not changed,'checked':len(manifest),'changed':changed}))
raise SystemExit(bool(changed))
''',encoding='utf-8')
(target/'.gitignore').write_text('node_modules/\ndist/\n.env.local\n.env.*.local\n*.secret.json\n*.tsbuildinfo\nbackups/\n.release/\n',encoding='utf-8')
(target/'.env.example').write_text('VITE_CLOUDBASE_ENV_ID=cloud-yunda-d5gxrar1s14b2ee0d\nVITE_CLOUDBASE_REGION=ap-shanghai\nVITE_CLOUDBASE_BACKEND=classic\n# Browser publishable key only. Never put a management key or service-role token here.\nVITE_CLOUDBASE_PUBLISHABLE_KEY=YOUR_BROWSER_PUBLISHABLE_KEY\n',encoding='utf-8')
(target/'README.md').write_text('''# 小食云记 · 当前网页版

[公开测试](https://bboy-lan.github.io/AI/) · [CloudBase入口](https://cloud-ynnu-d6gs8ekf7dbcbe80e-1517920911.tcloudbaseapp.com/)

React + TypeScript + Vite。当前后端采用CloudBase传统文档数据库及xsyj_web_v1函数；已替换本目录原Supabase旧版实现。首次以邮箱设置账号密码并完成验证，再完善昵称、头像和家乡省市、知晓基本须知后使用。会话自动恢复，资料和公告已读保存在云端。口味和预算可稍后选填。推荐发布必须填写名称、类别、具体地点、价格口径、辣度或甜度，并确认亲自吃过；照片、理由、地图和地点补充可留空。缺少必填项时前端拦截，服务端保留独立校验。公告通过“我已知晓”关闭，管理员可原位编辑。管理员权限由服务端独立xsyj_admins授权，不能由前端自选。三组demo参数仅在本浏览器模拟，不写真实库。

树洞现在包含黑榜避雷与同乡留言。黑榜先审后发；同乡/校园生活/吃喝吐槽可发主题、按楼层回复或引用，支持同省同市筛选、我的发帖/回复、撤回占位、举报快照和管理员带原因隐藏/恢复。消息仍从“我的”右上角互动消息查看，用户治理内进入讨论治理。家乡为自填信息，讨论是异步公开交流。价格框支持逐元按钮与长按。

[管理员讨论演示](https://bboy-lan.github.io/AI/?demo=admin#/treehole?tab=forum) · [普通用户案例](https://bboy-lan.github.io/AI/?demo=student#/me) · [空白案例](https://bboy-lan.github.io/AI/?demo=empty#/treehole?tab=forum)。演示仅写本浏览器，正式站通过登录真实参与。全功能范围和验证边界见docs/树洞讨论与全功能验收报告-20261109.md。

## 最新价格、首次使用与多公告

价格仅1～999整数元，服务端拒绝小数；历史价格只规范化展示，不批量覆盖。首次只强制基本须知，历史通知默认折叠为标题与摘要，点击展开全文；后续通知按需直接发布，可弹窗或仅公告中心。已取消新公告的开始/截止/定时设置，旧预约字段保留以免提前公开。云端按账号记录知晓，静默编辑不重复弹。首屏不依赖匿名登录，认证SDK按需加载；发布保留旧分块，资源失败重试避开旧HTML缓存。网页保持登录，网络故障不覆盖旧会话；重新登录保留资料和已读，微信实体机仍未实测。详见docs/公告简化与访问稳定性验收-20261109.md及docs/稳定访问与独立域名方案-20261109.md。

## 最新图片兼容与体验整改

头像、推荐配图、黑榜和树洞共用一套图片管线：先按手机方向解码，iPhone 的 HEIC/HEIF 在浏览器内转成 webp/jpeg 再上传，服务端不收 HEIC 原文件；按用途限制长边与体积，组图串行上传且失败项可单独重试，成功项保留，评价和反馈的上传未改。我的新增“导出 Excel”，可选范围、筛选、字段、列序和列标题，生成真实 xlsx，价格是数值列，文本不会被当成公式，手机保存路径在页面内提示。店名从发布、编辑、服务端、详情、首页搜索到导出独立维护，老记录没有店名就留空；首页可切换卡片/紧凑/格子并记住选择；头像可点开放大。正常公开内容不再显示“已审核”，管理员也不会收到自己发的公告弹窗。当前报告docs/图片兼容与使用体验整改-20261110.md。

## 最新每日活跃等级与每日发布额度

新用户默认「小吃货」每日 1 条推荐；按 Asia/Shanghai 自然日连续签到累计活跃天数（同一天重复登录不增加，中断从 1 天重来），7/14/21/28 天依次升级小吃货 Min / Plus / Pro / Ultra，额度 2/3/3/3 条。规则与文案集中在 server/classic/xsyj_web_v1/daily-level-rules.json；发布额度由服务端强制校验，前端只显示剩余额度与升级进度，额度用完会提示当前称号、明日可用额度与升级条件。管理员可在「用户治理 → 用户」为特定用户单独设置每日额度、填写原因与可选失效日期，也可取消覆写立即恢复等级默认值，操作人、时间、原因与历史写入服务端审计。旧用户缺字段按小吃货 1 条/日处理，无需数据迁移。推荐卡三视图的价格与单位是不可断行的完整单元，长标题/长店名/无图/无评分下不重叠、不换行。详见docs/每日活跃等级与发布额度-20261111.md。

## 最新身份与反馈

话题标签右上横排、紧凑图可点按放大、统一实体操作按钮；昵称旁显示吃货大王/小吃货，回复标明楼主。管理员本人新发布免审但仍遵守必填、配额和下架边界。我的新增问题反馈弹窗，私有多轮对话、处理中/已处理结果、用户补充重新提醒，与原互动消息共用记录。当前报告docs/帖子身份与问题反馈验收-20261109.md。

## 本地运行

最新集中审核台提供五类内容的标签/意见、要求修改、管理员编辑、可恢复软删除、批量部分失败、连续下一条、举报筛选及原互动消息修改入口。管理员从用户治理进入，讨论治理复用同一组件。组图支持350ms长按换序。100条隔离案例：[集中审核演示](https://bboy-lan.github.io/AI/?demo=admin&reviewCase=bulk#/review-admin)，只写本浏览器，真实管理员权限仍由服务端验证。当前验收与未实测边界见docs/集中审核与长按排序验收-20261109.md。

安装Node.js与Python后运行npm ci，复制.env.example为.env.local，仅填写浏览器publishable key，然后npm run dev。未配置环境时是明确标注的本地演示，不能当作云端部署。

## 构建与检查

npm test执行规则、源对照、数据库权限和刷新并发回归；npm run build执行类型检查及根路径生产构建。GitHub Pages子路径使用npm run build -- --base=/AI/。Vite会同时处理公共图标/示例图片子路径，哈希路由无需服务端重写。页面首轮初始化后切页复用已读取数据，后台刷新不卸载页面；写入后使缓存失效并重新读取。

## 后端

server/classic/xsyj_web_v1包含当前实际函数源码。所有xsyj_*集合禁止客户端直写，UID取自CloudBase运行时，绝不信任浏览器角色或旧微信OpenID。共用环境中的其他项目资源不能清空或覆盖。cloudbase/migrations是此前PG实现，保留作本地回归，不能对传统环境执行SQL。

管理端部署须先核对目标资源/授权，原项目维护者可运行node scripts/deploy.mjs；它固定当前已授权后端与H5静态环境。GitHub Pages gh-pages分支是构建产物，main分支保留本目录完整源码。浏览器签名链接缓存只在内存中短期保留。生产环境的域名、邮件投递、配额及费用以CloudBase控制台为准。

仓库不包含真实用户数据、私有迁移备份、管理员密钥、会话或用户密码。真实邮箱验证须由账号本人完成。公开测试中的帖子和反馈会写真实云端，请按页面提示填写。
''',encoding='utf-8')
(target/'server/classic/README.md').write_text('''# 当前传统CloudBase适配

xsyj_web_v1/index.js仅从服务端运行时取UID；service.cjs开放固定业务动作，native为当前小程序业务校验的隔离副本，forum.cjs实现新增Web异步讨论。内部ownerOpenId字段存Web UID，不做旧微信映射。原12个xsyj_*集合加6个xsyj_forum_*集合，均为ADMINONLY，经函数鉴权访问；不可清理共用环境中其他应用的表、函数、认证或网站。

讨论资源初始化使用node scripts/initialize-forum.mjs，只创建明确的6个讨论集合和索引；已有集合若权限不符则拒绝覆盖。发帖/修改每日5次、回复60次、举报20次，成功重试不重复计数。旧PG迁移不能对当前NoSQL环境执行。应先盘点并备份后部署，不能以初始化为由重置全环境。

集中审核另有xsyj_review_audit（包含幂等回执）和xsyj_review_notifications两个ADMINONLY集合，使用node scripts/initialize-review.mjs建立；不复制原业务内容，不重置已有数据。moderation.cjs负责服务端权限、标签与可见性、管理员编辑、版本审计、批量逐条结果和本人通知；review-policy.cjs在作者实际写入事务中拦截旧版本/软删除绕过。

每日活跃等级与每日发布额度由 daily-activity.cjs 统一裁决：context 幂等签到写 xsyj_profiles 的 activityLastDay/activityStreak，覆写写 dailyQuotaOverride，审计写 xsyj_events（type=daily_quota_override）；submitItem 必须调用 assertQuota，不能只在前端限制。规则表 daily-level-rules.json 是前后端唯一来源，不新建集合、不迁移历史资料；取消覆写写 active:false 而不写 null。

部署源码见工程根scripts/deploy.mjs；真实验收脚本使用独立临时外部账号并精确清理。gateway-with-xsyj.rego仅是维护者当前策略参考，不得覆盖别人的或后续变更后的共享策略。
''',encoding='utf-8')
(repo/'README.md').write_text('''# 小食云记

[网页版入口](https://bboy-lan.github.io/AI/) · [备用测试入口](https://cloud-ynnu-d6gs8ekf7dbcbe80e-1517920911.tcloudbaseapp.com/) · [最新源码与运行说明](yunda-food/README.md)

当前源码在yunda-food/，React/TypeScript/Vite + CloudBase文档数据库。已替换此前Supabase旧网页版，保留Git历史。首次先注册登录、完善资料和知晓须知；登录会话自动恢复，管理员由后端授权。demo示例只保存在本机。真实数据和私有备份不在仓库中。
''',encoding='utf-8')
files=list(target.rglob('*'))
for p in files:
    if not p.is_file():continue
    rel=p.relative_to(target).as_posix()
    assert not any(x in p.relative_to(target).parts for x in ['backups','node_modules','.release'])
    assert not p.name.endswith('.secret.json') and p.name!='.env.local'
    if p.suffix in ['.js','.ts','.tsx','.json','.py','.mjs','.cjs','.md','.rego']:
        text=p.read_text(encoding='utf-8')
        assert '948589783@qq.com' not in text,rel
        assert not re.search(r'-----BEGIN (?:RSA )?PRIVATE KEY-----\s+[A-Za-z0-9+/]{30}',text),rel
print(json.dumps({'sourceFiles':sum(p.is_file() for p in files),'referenceFiles':len(copied),'repository':str(repo),'privateFilesExcluded':True},ensure_ascii=True))
