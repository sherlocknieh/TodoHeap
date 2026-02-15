# TodoHeap 前端

## 开发指南

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

## 目录结构

- `src/`            - 源代码目录
  - `components/`   - 可复用组件
  - `libs/`         - 第三方库
  - `pages/`        - 主要页面
  - `router/`       - 路由配置
  - `store/`        - 状态管理
  - `utils/`        - 工具函数