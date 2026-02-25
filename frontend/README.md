# TodoHeap 前端开发指南


### 前端项目结构
- `public/`         - 静态资源
- `src/`            - 主要代码
  - `api/`          - 后端API封装
  - `components/`   - 可复用组件
  - `composables/`  - 可复用逻辑
  - `pages/`        - 主要页面
  - `router/`       - 路由配置
  - `store/`        - 状态管理
  - `utils/`        - 逻辑无关的工具函数
- `index.html`      - 前端应用的第一入口
- `.env.local`      - 本地环境变量配置
```
# .env.local 示例内容:
VITE_SUPABASE_URL=https://nxzvisuvwtsnlrugqghx.supabase.co
VITE_SUPABASE_PUB_KEY=sb_publishable_EJtqpRfKkcd8PKX--U1O7g_zQWWNo9z
```
- `其它`            - 各种配置文件