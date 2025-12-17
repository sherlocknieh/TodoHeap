# TodoHeap 前端

## 开发指南

- 安装 Node.js
    ```powershell
    # 非 Win11 用户请访问官网 https://nodejs.org/ 下载安装;
    # Win11 可用 winget 命令一键安装
    winget install OpenJS.NodeJS

    # 安装完成后配置 npm 源为国内镜像
    npm config set registry https://registry.npmmirror.com
    ```
- 安装项目依赖(在 frontend 目录下运行)
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