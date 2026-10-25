// 示例示意图：AI 生成、非云大实拍，统一存放在 /samples 下（Vite public 目录）。
// 每条示例记录都带“示例”印章；组件层仍有加载失败兜底（见 FoodImage）。
// 使用相对路径（无前导斜杠）：根路径部署与 GitHub Pages 子路径 /AI/ 下都能正确解析，
// Hash 路由不会改变文档基础路径。

export const HERO_IMAGE = 'samples/hero.jpg'

export function sampleImage(id: string): string {
  return `samples/${id}.jpg`
}
