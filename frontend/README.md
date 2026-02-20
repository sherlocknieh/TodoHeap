# TodoHeap 前端

## 开发指南

### 环境搭建

- 安装 Node.js
    ```powershell
    winget install OpenJS.NodeJS
    # 或者访问官网 https://nodejs.org/ 下载安装

    # 配置 npm 源为国内镜像, 提高第三方库的下载速度
    npm config set registry https://registry.npmmirror.com
    ```

- 安装项目依赖 (在 frontend 目录下运行)
    ```bash
    npm install
    ```

- 运行 (在 frontend 目录下运行)
    ```bash
    npm run dev
    ```

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
- `index.html`      - 应用入口
- `其它`            - 配置文件