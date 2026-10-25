# 云大饭搭子 · 在线演示

**公网演示地址（手机浏览器直接打开）：<https://bboy-lan.github.io/AI/>**

云南大学呈贡校区的学生平价吃喝 H5：按口味找吃的、开条件盲盒、看同学推荐。

## 仓库结构

- `yunda-food/` —— 当前参赛作品源码（React + Vite + TypeScript），运行与部署说明见该目录 README
- `List/`、根目录 `index.html` —— 早期静态原型（保留存档）
- `gh-pages` 分支 —— 公网演示的构建产物（Pages 自动发布）

## 本地运行

```powershell
cd yunda-food
npm install
npm run dev
```

## 当前演示说明

- 首屏 30 秒设置口味（辣度/咸甜/面米/油重/预算/家乡，可随时修改、本机保存）。
- 17 条起始吃喝均标注「示例」（店名价格照片未现场核验，照片为 AI 示意图）。
- 未接共享数据库时，投稿会如实保存为「本机草稿」并提示其他手机不可见，不假报发布成功；
  接通 Supabase（见 `yunda-food/server/supabase-schema.sql`）后投稿/图片/评论即跨设备共享。
