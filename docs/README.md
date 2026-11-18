# TodoHeap 文档

VitePress 站点，构建产物输出到 `../dist`（站点根），前端挂在 `/app/` 子路径，两者一起发布到 GitHub Pages。

## 结构

| 路径 | 内容 |
| --- | --- |
| `index.md` | 站点首页（`layout: home`），同时是对外落地页 |
| `user/` | 用户指南 |
| `dev/` | 开发文档：目标、搭建、架构、流程、代码地图、关键词索引、`logic/` 机制文档 |
| `features/` | 按功能域记录已实现能力 |
| `public/` | logo、截图与图标 |
| `en/` | 英文翻译，**当前不参与构建**（见 `srcExclude`），补全后再接入 |
| `.vitepress/config.mts` | 站点配置与手写侧栏 |

## 命令

```bash
npm install
npm run dev    # http://localhost:5201/TodoHeap/
npm run build
```

## 新增文档

在 `user/`、`dev/` 或 `features/` 下新建 Markdown，再到 `.vitepress/config.mts` 对应的侧栏数组补一行。

URL 等于文件的相对路径，不带语言前缀，也不带 `.html`。
