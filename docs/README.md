
# TodoHeap 文档项目说明

本目录是 TodoHeap 的文档子项目，基于 VitePress 构建，提供中英文文档站点。

- 在线文档: https://sherlocknieh.github.io/TodoHeap/docs/zh/
- 技术栈: VitePress 2 + vitepress-sidebar + Mermaid + KaTeX
- 部署路径: `/TodoHeap/docs/`

## 目录结构

```text
docs/
	.vitepress/            # VitePress 配置
	en/                    # 英文文档
	zh/                    # 中文文档
	public/                # 文档静态资源
	package.json           # 文档脚本
	README.md              # 当前说明文档
```

说明:

- 中文内容放在 `zh/`，英文内容放在 `en/`。
- `index.md` 用于对应目录首页。
- 导航和侧边栏由 `.vitepress/config.mts` 统一配置和自动生成。

## 本地开发

在 `docs` 目录下执行以下命令。

1. 安装依赖

```bash
pnpm i
```

2. 启动开发服务器

```bash
pnpm run dev
```

默认端口为 `5201`。

3. 构建静态页面

```bash
pnpm run build
```

默认输出目录为 `../dist/docs`（在 `.vitepress/config.mts` 中配置）。

4. 本地预览构建产物

```bash
pnpm run preview
```

## 可用脚本

- `pnpm run dev`: 启动 VitePress 开发服务器
- `pnpm run build`: 构建文档站点
- `pnpm run preview`: 预览构建结果

## 多语言与路由规则

当前文档启用了多语言配置:

- 英文: 根路径 `/`
- 中文: `/zh/`

构建时通过 rewrites 规则将 `en/` 重写到根路径，因此:

- 访问 `/` 默认展示英文首页
- 访问 `/zh/` 展示中文首页

## 新增文档详细指导

### 1. 明确文档类型和放置位置

先判断文档属于哪一类:

- 用户使用说明: 放到 `zh/user-guide/` 或 `en/user-guide/`
- 开发实现说明: 放到 `zh/dev-guide/` 或 `en/dev-guide/`
- 首页/导航入口: 通常维护对应目录的 `index.md`

建议先写中文版本（`zh/`），英文版本（`en/`）可按优先级补齐。

### 2. 文件命名规则

- 推荐语义化命名，体现主题，如: `realtime-sync.md`
- 需要表达阅读顺序时可加前缀序号，如: `06.realtime_sync.md`
- 避免使用含糊命名，如: `new.md`、`temp.md`、`test2.md`

### 3. 文档骨架模板

新增文档后，建议至少包含以下结构:

```markdown
# 文档标题

## 背景

说明这篇文档要解决什么问题。

## 目标

- 目标 1
- 目标 2

## 实现/操作步骤

1. 步骤 1
2. 步骤 2
3. 步骤 3

## 示例

可放代码、SQL、命令行或流程图。

## 常见问题

- 问题 1: 处理方式
- 问题 2: 处理方式

## 参考资料

- 相关链接或仓库内关联文档
```

### 4. 新增文档的标准流程

1. 选择语言和模块目录（如 `zh/dev-guide/`）。
2. 创建新文件并写入一级标题（`# 标题`）。
3. 按模板补齐背景、目标、步骤和示例。
4. 如果是系列文档，补充序号并检查前后文衔接。
5. 启动 `pnpm run dev` 检查侧边栏是否出现、链接是否可访问。
6. 执行 `pnpm run build`，确认构建成功。
7. 提交前自检格式、错别字、命令可执行性。

### 5. 多语言维护策略

- 最低要求: 中文和英文都保留对应入口页（`index.md`）
- 推荐做法: 中文先行，英文在同次或后续迭代补齐
- 同步原则: 术语、标题层级、步骤编号尽量一致
- 如果英文暂未完成，可在 PR 描述中标注待补翻译范围

### 6. 提交前检查清单

- 文档放在正确目录（`zh|en` × `user-guide|dev-guide`）
- 标题层级合理（不跳级）
- 代码块语言标注正确（`bash`、`ts`、`sql` 等）
- 站内链接和锚点可访问
- 本地 `dev` 预览正常，`build` 构建通过

### 7. 常见错误与修复建议

- 侧边栏没出现新文档:
	- 检查文件是否放在受扫描目录内
	- 检查文件名后缀是否为 `.md`
- 文档路径 404:
	- 检查链接是否使用了正确语言前缀（如 `/zh/...`）
- 构建后资源路径异常:
	- 核对 `.vitepress/config.mts` 的 `base` 是否与部署路径一致

### 8. 如何新增类目

类目分为两种: 子类目（在现有大类下新增）和顶层大类（新增与 `user-guide`/`dev-guide` 同级的栏目）。

#### 场景 A: 新增子类目（推荐）

适用场景: 只是在现有 `user-guide` 或 `dev-guide` 下细分一个新主题。

操作步骤:

1. 在目标目录创建子文件夹（例如 `zh/dev-guide/database/`）。
2. 在该文件夹下创建 `index.md`，并写入一级标题作为类目名。
3. 在同目录继续添加该类目的具体文档（如 `migration.md`、`rls.md`）。
4. 运行 `pnpm run dev`，确认侧边栏自动出现该类目。
5. 运行 `pnpm run build`，确认构建通过。

说明: 当前侧边栏配置已启用“读取文件夹 `index.md` 作为目录标题与链接”，所以该方式通常不需要改配置文件。

#### 场景 B: 新增顶层大类

适用场景: 需要新增与 `user-guide`、`dev-guide` 同级的新栏目（例如 `api-guide`）。

操作步骤:

1. 新建中英文目录:
   - `zh/api-guide/index.md`
   - `en/api-guide/index.md`
2. 修改 `.vitepress/config.mts` 中的目录扫描配置，将新目录加入 `folders` 数组。
3. 修改中英文导航配置（`locales.root.themeConfig.nav` 和 `locales.zh.themeConfig.nav`），加入新栏目入口。
4. 运行 `pnpm run dev` 检查导航、侧边栏和路由。
5. 运行 `pnpm run build` 验证最终产物。

建议:

- 如无必要，优先使用“新增子类目”，改动范围更小。
- 新增顶层大类时，中文和英文入口建议同时创建，避免语言切换后出现空白栏目。

## 写作约定

- 文件名尽量语义化，必要时可加序号表达阅读顺序。
- 一个文档聚焦一个主题，避免超长“混合型”页面。
- 代码块需标注语言类型，如 `ts`、`sql`、`bash`。
- 涉及流程说明时优先使用列表或 Mermaid 图，保持可读性。
- 中英文文档可按优先级逐步对齐，不要求一次性完全同步。

## 常见问题

- 静态资源路径异常:
	- 检查 `.vitepress/config.mts` 的 `base` 是否与部署路径一致。
- 侧边栏未更新:
	- 确认文档放在受扫描的目录（`zh|en` × `user-guide|dev-guide`）下。
- 构建死链告警:
	- 当前配置 `ignoreDeadLinks: true`，但仍建议尽量修复失效链接。
