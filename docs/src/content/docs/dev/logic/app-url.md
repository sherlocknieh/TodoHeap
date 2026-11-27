---
title: "应用地址与路由前缀"
---
# 应用地址与路由前缀

应用产物挂在文档站的 `/TodoHeap/app/` 子路径下，页面内部视图由 Vue Router 的 hash 承载，地址形如：

```text
https://sherlocknieh.github.io/TodoHeap/app/#/graph
```

## 一、两段前缀各管一层

| 段 | 来源 | 作用 |
| --- | --- | --- |
| `/TodoHeap/app/` | `frontend/vite.config.ts` 的 `base` | GitHub Pages 上文档站占用 `/TodoHeap/` 根，应用只能挂在 `/app/`；构建产物输出到 `dist/app` |
| `#/graph` | `frontend/src/router/index.ts` | hash 路由只写视图名；工作区父路由是 `/`，子路由为 `graph` / `list` / `heap` / `ai` / `schedule` / `trash` |

## 二、约束

- 工作区父路由带 `meta.workspace`，离开它时路由守卫会收起设置浮窗；新增应用内顶层页面需显式判断，否则会被当作站外页面。
- 根路由 `/` 重定向到任务图；工作区子路由不要重复写 `/app` 前缀，否则地址栏会出现两段 `app`（旧地址 `/TodoHeap/app/#/app/graph` 即由此而来）。
- 认证回跳的 token 也拼在 hash 上（`#access_token=...`），由 `frontend/src/utils/handleAuthCallback.ts` 在挂载路由前消费，因此 hash 路由必须容忍这种非路由 hash。
- 登录后默认跳 `/graph`，未登录访问会跳登录页并在登录后按 `redirect` 查询参数回到原视图。

## 三、验证

- 打开 `/TodoHeap/app/#/graph`、`#/list`、`#/schedule`，地址栏不出现 `#/app/`。
- 刷新任一视图仍停在原视图；从设置页收起浮窗后回到进入设置前的视图。
