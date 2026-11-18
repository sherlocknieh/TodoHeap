# TodoHeap 文档

Astro Starlight 站点，构建产物输出到 `../dist`（站点根），前端挂在 `/app/` 子路径，两者一起发布到 GitHub Pages。

## 结构

| 路径 | 内容 |
| --- | --- |
| `src/content/docs/` | 所有页面，URL 等于文件相对路径 |
| `src/content/docs/index.mdx` | 站点首页（`template: splash`），同时是对外落地页 |
| `src/content/docs/user/` | 用户指南 |
| `src/content/docs/dev/` | 开发文档：目标、搭建、架构、流程、代码地图、关键词索引、`logic/` 机制文档 |
| `src/content/docs/features/` | 按功能域记录已实现能力 |
| `src/assets/` | 站点 logo |
| `public/` | logo、截图与图标 |
| `en/` | 英文翻译，**当前不参与构建**，补全后再接入 |
| `astro.config.mjs` | 站点配置与手写侧栏 |

## 命令

```bash
npm install
npm run dev    # http://localhost:4321/TodoHeap/
npm run build
```

## 新增文档

在 `src/content/docs/` 下新建 Markdown，再到 `astro.config.mjs` 对应侧栏分组补一行。

URL 等于文件的相对路径，不带 `.html`。
