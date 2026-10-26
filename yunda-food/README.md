# 云大饭搭子（yunda-food）

手机优先的公网 H5：按我的口味找云大呈贡校区的平价吃喝、开条件盲盒、发布同学推荐。
依据 `outputs/PRD-云大饭搭子.md`（执行版 PRD）实现第一版。

## 运行方式

```powershell
npm install
npm run dev          # 本机开发，默认 http://localhost:5173 （已加 --host，局域网手机可访问）
npm run build        # 类型检查 + 生产构建（dist/）
npm run preview      # 预览生产构建
npm run lint         # oxlint，当前 0 error
```

手机局域网测试：电脑和手机连同一 Wi-Fi，用 `http://电脑局域网IP:5173` 打开。
公网演示（比赛要求“他人手机可操作”）需要部署，推荐 `npm run build` 后把 `dist/`
发到任意静态托管（Vercel / Netlify / Cloudflare Pages），并按下文配置 Supabase。

**当前公网演示地址（GitHub Pages）：<https://bboy-lan.github.io/AI/>**

重新部署到该 Pages（需要对 Bboy-Lan/AI 的推送权限）：

```powershell
npm run build:pages          # 以 base=/AI/ 产出 dist/
# 然后把 dist/ 内容强制推送到仓库 gh-pages 分支根目录
```


## 本轮已实现

- **首访“先认识你的饭搭子身份”**：默认昆明市；必须如实填写吃货 ID 与户籍/家乡地点（如“昭通镇雄”），才能进入；
  辣度/咸甜/面米/油重和预算都可稍后在“我的”补充。家乡用于同乡投稿推荐，不要求精确住址。
- **找吃的**：关键词搜索；区域（知味堂/余味堂/仕林街/南都）、正餐/小吃/饮品、预算
  （快捷金额+自定义、人均/总额）、“完全不要辣”硬过滤、“同乡投稿”筛选；
  饭票卡片显示照片、价格口径、具体位置和**具体匹配理由**；无坐标不显示距离。
- **盲盒**：人数、人均/总额、类别、区域、辣度、同乡投稿条件 → 仅从合格候选等概率随机；
  饭票翻牌动效、再抽（避开上一个结果）、看详情；候选为空给具体调整建议，不编造；
  价格算法板明示口径：单份按每人一份、人均按店内人均，多人估价=每人价×人数。
- **详情**：基础资料、口味标签、来源/示例状态、价格记录日期、无坐标声明；
  “想吃”本机收藏。
- **发布**：完整表单（名称/类别/校区/区域/窗口/价格口径/口味/关键词/描述/图片/昵称/家乡/自报吃过），
  图片浏览器端压缩（≤8MB 源、1280px、JPEG 0.78）。**未接服务端时只存本机草稿并明示
  “其他手机看不到”，绝不假报发布成功。**
- **评论**：必须自报“吃过”+大致月份才能给体验分；同一浏览器一条投稿只存一份评分（可覆盖）。
  本地模式存本机；服务端模式通过 `submit_review` RPC  upsert 并刷新聚合分。
- **视觉**：学生饭票主题（海鸥蓝 #276EA0 / 辣油红 #E94E3C / 饭票黄 #F1C75B），
  票券撕口卡片、印章、翻牌动效；底部仅“找吃的/开盲盒/我的”+独立红色“发布推荐”。
  390px 与 320px 宽下均无横向溢出（已用浏览器实测）。
- **起始内容**：17 条云大呈贡示例（正餐10/小吃4/饮品3，区域覆盖4个片区、
  价格5–22元、多种口味），全部打“示例”印章；17 张配图+1 张首屏图均为
  AI 生成的示意图（`public/samples/`），非云大实拍；加载失败有饭票样式兜底。

## 数据与架构

- React 19 + Vite 8 + TypeScript 6；react-router-dom（HashRouter，静态托管免配置）；
  lucide-react 图标；无 UI 大框架，样式为单文件设计系统 `src/index.css`。
- 统一数据模型 `src/types.ts` 与访问层 `src/lib/repo.ts`，两个实现：
  - `LocalRepo`（默认，无环境变量）：示例数据 + localStorage 草稿/评价。
  - `SupabaseRepo`：配置 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 后自动启用，
    状态机 `checking / online / offline`；云端读失败显式报错并提供重试，
    示例内容可继续浏览但不会掩盖“真实投稿读不到”。
- localStorage 仅存：口味画像、收藏、本机草稿、本机评论；Supabase 匿名会话也由 SDK 本地持久化。

### 云端安全模型（v2，2026-10-25）

- 浏览投稿/评论/图片：未登录（anon）可读白名单列；owner 等内部字段不下发。
- 投稿与评分：首次操作自动 **Anonymous Sign-In**（无注册/邮箱/手机号/登录表单），
  数据库角色为 authenticated；会话本地复用，不会重复创建匿名用户。
- 所有写入只走 SECURITY DEFINER RPC（`submit_food_item` / `submit_review` /
  `submit_feedback`），固定 `search_path`；表本身不对任何访客开放写入。
- 评价归属由服务端 `auth.uid()` 决定，客户端无法传入或伪造身份；同一身份对一条投稿仅一份评价，
  更新评分覆盖旧记录、评价人数不重复增加；人数与均分由数据库触发器聚合，客户端不可写。
- 图片上传到 Storage 的 `<本人uid>/` 目录，RLS 校验路径与 MIME/扩展名，
  桶限制 jpg/png/webp、≤8MB；数据库保存公开 URL，不存 blob/本机路径。
- 价格纠错与举报进 `feedback` 待处理队列，不自动覆盖原价、不给访客删除/管理权。
- service_role / secret key 不进入任何 `VITE_` 变量。

### v3 可信身份、地点与审核迁移（2026-10-26）

本轮前端已兼容旧库的只读浏览；要启用吃货 ID、地点核验、跨设备想吃榜、软下架和管理员权限，
项目所有者需要在 Supabase SQL Editor **一次性执行**
[`server/migrations/2026-10-26-v3-trust-location-moderation.sql`](./server/migrations/2026-10-26-v3-trust-location-moderation.sql)。
它只新增表/字段/RPC/策略，不删除既有投稿、图片或评论。执行前不要向前端暴露 service_role；地图服务仍未接入，任何没有坐标的投稿都只按地点显示、不会伪造距离。若曾执行过早期 v3/v3.1 文件，请再执行一次 [v3.2 修复](./server/migrations/2026-10-26-v3.2-safe-foodie-id.sql)；它修正中文吃货 ID 的 PostgreSQL 正则兼容性并刷新 RPC 缓存。

管理员内容管理台还需要执行 [`v3.3 管理台迁移`](./server/migrations/2026-10-26-v3.3-admin-console.sql)。执行后，先在应用的 `/#/admin` 页面完成一次吃货 ID 设置并复制“当前匿名设备 ID”，再由项目所有者在 SQL Editor 手工登记该设备：

```sql
insert into public.admin_users (user_id)
values ('从 /#/admin 复制的 UUID')
on conflict (user_id) do nothing;
```

这是唯一的提权步骤；前端 URL、按钮或传入的 userId 均不能成为管理员。登记完成后重新打开 `/#/admin`，即可查看在架/已下架投稿、填写原因下架和恢复上架。

要启用管理员的评论审核、吃货 ID/用户内容限制、社区匿名人数概览，以及“已认证管理员授权另一浏览器身份”，还需要执行 [`v3.4 二次审核迁移`](./server/migrations/2026-10-26-v3.4-admin-moderation.sql)。它不会删除用户、投稿或评论：隐藏评论会从公开列表、评分聚合和地点核验中排除；恢复后重新计入。匿名会话按浏览器存储，因此同一电脑的 Edge、内置浏览器和无痕窗口本来就是不同身份；只能由已确认管理员在管理台明确授权另一个已初始化浏览器的 UUID，不能自动合并。

最后执行 [`v3.5 示例审核`](./server/migrations/2026-10-26-v3.5-sample-moderation.sql)、[`v3.6 旧版物理删除`](./server/migrations/2026-10-26-v3.6-admin-hard-delete.sql)、[`v3.7 审核闭环`](./server/migrations/2026-10-26-v3.7-moderation-lifecycle-closure.sql)、[`v3.8 昆明地点范围`](./server/migrations/2026-10-26-v3.8-kunming-location-scope.sql) 与 **[`v3.9 位置与作者编辑`](./server/migrations/2026-10-26-v3.9-location-and-author-edit.sql)**。v3.9 让作者保存菜品大致坐标、按当前位置和距离滑条筛选，并且只能补充/更正自己的投稿；编辑不会改变下架状态、评分或归属。v3.7 让投稿/评论作者收到仅自己可见的处理说明，阻断“下架父投稿但仍公开读取评论”，限制被处理身份的图片上传，并停用旧版前台物理删除 RPC。因为现有图片桶仍为公开读取，常规治理只使用“下架 / 恢复”；不要再把 v3.6 的数据库行删除当作“图片已彻底删除”。

### 启用共享数据库（唯一需要的外部配置）

1. 打开 <https://supabase.com/dashboard>，创建或选择项目（Project URL 在
   Project Settings → API；本地区域任选，免费档足够演示）。
2. **Authentication → Sign In / Providers → 打开 Anonymous 开关** 并 Save。
3. 新项目先执行 [`server/supabase-schema.sql`](./server/supabase-schema.sql)，再按文件名顺序执行所有 `server/migrations/`；已有项目只执行尚未执行的后续迁移。**不要在已升级 v3.9 的项目中单独重跑旧 schema 文件**，它会覆盖较新的 RPC/策略定义；如需重建，请从 schema 开始按完整顺序重放。
4. 复制 `.env.example` 为 `.env.local`，填 Project URL 与 anon/publishable key（变量名仍为
   `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`），重启 `npm run dev`。
5. “我的”页出现绿色“已接通共享数据库”即成功。

### 项目所有者处理反馈（最小操作，无需管理后台）

在 Supabase SQL Editor 查看待处理队列：

```sql
select f.*, i.name from public.feedback f
join public.food_items i on i.id = f.item_id
where f.status = 'pending' order by f.created_at desc;
```

核实价格后手工更新（涨价才改，并更新日期）：

```sql
update public.food_items set price = 15, price_updated_at = current_date where id = '对应uuid';
update public.feedback set status = 'resolved' where id = '对应uuid';
-- 无效反馈：update public.feedback set status = 'dismissed' where id = '对应uuid';
-- 需要下架违规投稿：请使用 /#/admin 填写原因，不要直接改表。
```


## 实际验证与边界

- 已配置 Supabase 匿名登录、数据库与 Storage；2026-10-25 以隔离浏览器会话验证了“读取投稿与图片 → 提交体验分 → 覆盖评分”，评分覆盖后评价人数不重复增加。
- 已验证直接写表、直接修改评论、伪造 RPC 参数、非本人目录上传与非图片上传均被拒绝；离线时，发现页和评论区都显示失败状态与重试入口。
- 公网 H5 已按 GitHub Pages 的 `/AI/` 基路径构建。仍需真实手机在移动网络上的最终验收；桌面隔离浏览器不替代这项检查。
- 本项目当前范围仅为“找吃的 / 盲盒 / 投稿 / 评论 / 反馈”闭环。DDL 卡、拼饭/聊天、认证、地图登录、雷达图、Canvas 海报与物理摇动均不做。
- 起始店名/价格/照片均为未现场核验的示例，不等于真实投稿验收。
- 无真实大模型调用；推荐为规则可解释筛选/排序，不声称 AI。
- 正式题面若要求真实 AI，优先实现“一句话解析为筛选条件”，仅引用已发布投稿。

## 目录速览

```
src/
  types.ts                 全站统一字段
  data/campus.ts           校区/区域/家乡/口味标签
  data/seed.ts             17 条示例内容
  lib/match.ts             硬过滤、口味打分、盲盒抽取、空结果建议、价格算法
  lib/repo.ts              仓储选择（local / supabase）
  lib/localRepo.ts         本机实现
  lib/supabaseRepo.ts      服务端实现（投稿/图片/评论 RPC）
  lib/profile.tsx          口味画像 Context（localStorage）
  lib/imageProcess.ts      投稿图片压缩
  components/              Onboarding、FoodCard、FiltersSheet、AppLayout、ui
  pages/                   Discover / BlindBox / Detail / Publish / Me
server/supabase-schema.sql 共享数据库初始化
```
