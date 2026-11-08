# TodoHeap 前端开发指南

各模块职责与调用链见仓库根目录的 [AGENTS.md](../AGENTS.md)，这里只列目录与本地配置。

### 前端项目结构
- `public/`         - 静态资源
- `src/`            - 主要代码
  - `components/`   - 可复用组件（含 `AppIcon.vue` 图标全集）
  - `lib/`          - 外部服务封装（`supabase.ts`、`userSettings.js`）
  - `pages/`        - 页面；`pages/todo/` 是工作区内的四个视图与设置页
  - `router/`       - 路由配置（hash 模式）
  - `stores/`       - Pinia 状态管理，`todos.*` 为可插拔切片
  - `utils/`        - 纯函数工具（优先级计算、详情面板上下文）
  - `style.css`     - Tailwind 入口与设计令牌
- `vite.config.ts`  - `base: '/TodoHeap/'`，构建输出到仓库根的 `dist/`
- `.env.local`      - 本地环境变量配置
```
# .env.local 示例内容:
VITE_SUPABASE_URL=https://nxzvisuvwtsnlrugqghx.supabase.co
VITE_SUPABASE_PUB_KEY=sb_publishable_EJtqpRfKkcd8PKX--U1O7g_zQWWNo9z
```

### 常用命令
```bash
pnpm dev          # 开发服务器，端口 5200
pnpm build        # 构建到 ../dist
pnpm test         # vitest，覆盖 store 层
pnpm type-check   # vue-tsc（当前与 TS 5.9 不兼容，会报内部错误）
```
