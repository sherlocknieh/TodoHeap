
# TodoHeap 文档项目

本目录包含 TodoHeap 项目的 VitePress 文档站点。

## 目录结构

```
docs/
├── .vitepress/             # VitePress 配置与类型声明
├── public/                 # logo、截图与图标
├── zh/                     # 中文文档
│   ├── index.md            # 首页
│   ├── user/               # 用户指南
│   │   ├── index.md
│   │   ├── 01.task-management.md
│   │   ├── 02.ai-features.md
│   │   ├── 03.views.md
│   │   ├── 04.sync-offline.md
│   │   └── 05.faq.md
│   └── dev/                # 开发文档
│       ├── index.md
│       ├── 00.goals.md     # 项目愿景与方案
│       ├── 01.setup.md
│       ├── 02.architecture.md
│       └── 03.development.md
└── en/                     # 英文文档
    ├── index.md
    ├── user/index.md
    └── dev/
        ├── index.md
        └── 00.goals.md
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