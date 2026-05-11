
# TodoHeap 文档项目

本目录包含 TodoHeap 项目的 VitePress 文档站点。

## 目录结构

```
docs/
├── .vitepress/
│   ├── config.mts          # VitePress 配置文件
│   └── vitepress-env.d.ts  # TypeScript 环境声明
├── zh/                     # 中文文档
│   ├── index.md           # 首页
│   ├── user/               # 用户指南
│   │   ├── index.md
│   │   ├── task-management.md
│   │   ├── views.md
│   │   ├── ai-features.md
│   │   ├── sync-offline.md
│   │   └── faq.md
│   ├── dev/                # 开发文档
│   │   ├── index.md
│   │   ├── setup.md
│   │   ├── development.md
│   │   └── architecture.md
│   └── test/               # 测试文档
│       └── index.md
└── en/                     # 英文文档
    ├── index.md
    ├── user/index.md
    ├── dev/index.md
    └── test/index.md
```

## 添加新文档

在 `zh/` 或 `en/` 目录下创建新的 Markdown 文件即可。文件名和目录结构会自动映射到对应的 URL 路径。

## 修改导航

### 顶部导航栏

在 `.vitepress/config.mts` 文件的 `locales.root.themeConfig.nav`（英文）和 `locales.zh.themeConfig.nav`（中文）中修改。

### 首页按钮

在 `zh/index.md` 或 `en/index.md` 文件的 `hero.actions` 中修改首页按钮链接。

### 侧边栏

侧边栏会根据文档目录结构自动生成，通过 `vitepress-sidebar` 插件配置在 `.vitepress/config.mts` 中。