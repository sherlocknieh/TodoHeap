# TodoHeap 前端

- 安装 Node.js
    ```powershell
    # Win11 使用 winget 安装 Node.js
    winget install OpenJS.NodeJS
    # 非 Win11 用户请访问官网 https://nodejs.org/ 下载安装;

    # 配置 npm 源为国内镜像
    npm config set registry https://registry.npmmirror.com
    ```
- 安装项目依赖
    ```bash
    npm install
    ```
- 运行
    ```bash
    npm run dev
    ```

## 目录指南

- `src/` - 源代码目录
  - `components/`   - 可复用小组件
  - `layouts/`      - 布局组件
  - `libs/`         - 第三方库封装
  - `pages/`        - 主要页面
  - `utils/`        - 算法工具
  - `store/`        - 状态管理
  - `style.css`     - 全局样式文件
  - `main.js`       - 入口文件
  - `App.vue`       - 根组件