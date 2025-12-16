# TodoHeap 任务堆

- **核心功能**: 在 TodoList 上增加 AI 自动分解任务的功能, 减轻任务管理压力;
- **特色功能**: 以堆结构展示最优先的任务, 省去在多个平等任务中做选择的精力;

## 快速链接

- **应用首页**: https://sherlocknieh.github.io/TodoHeap/
- **在线文档**: https://sherlocknieh.github.io/TodoHeap/docs/
- **项目主页**: https://edu.gitee.com/xmu-ai/projects/820580/
- **代码仓库**: https://github.com/sherlocknieh/TodoHeap
- **代码仓库**: https://gitee.com/xmu-ai/TodoHeap

## 开发指南

### 前端开发

- 安装 Node.js
  ```powershell
  winget install OpenJS.NodeJS
  ```
- 配置国内镜像源
  ```bash
  npm config set registry https://registry.npmmirror.com
  ```
- 安装项目依赖
  ```bash
  cd frontend; npm install
  ```
- 本地调试运行
  ```bash
  cd frontend; npm run dev
  ```

- 需要修改的代码在 frontend/src 目录下:
  - 主要页面的代码在: pages
  - 工作页面的代码在: pages/work
  - 通用组件的代码在: components
  - 状态管理的代码在: store
  - 布局组件的代码在: layouts
  - 算法相关的代码在: utils

- 修改推送到 GitHub 后会自动部署为在线应用;

### 后端

- 注册登录 [Supabase](https://supabase.com/) 管理数据库;
- 本地编写后端函数: supabase/functions/;
  - 参考[官方教程](https://supabase.com/docs/guides/local-development)下载supabase-cli;
  - 参考[官方边缘函数快速开始](https://supabase.com/docs/guides/functions/quickstart)编写边缘函数;

- 本地编写SQL脚本: supabase/migrations/;
- 推送到 GitHub 后会自动部署;

### 在线文档

- 在 docs/ 下创建和编辑文档;
- 推送到 GitHub 会自动部署为在线文档;
- requirements.txt 是自动构建所需的依赖, 请勿删除;

### 提交指南

1. 先到 Issue 页面查看/创建/认领任务: https://gitee.com/xmu-ai/TodoHeap/issues

2. 本地创建新分支并开始工作:
   ```bash
   git checkout -b <分支名>
   ```

3. 发布分支后到仓库分支页面提 Pull Request:
   https://gitee.com/xmu-ai/TodoHeap/branches?scope=owner 提交前关联对应的
   Issue, 勾选 "合并后关闭提到的 Issue";

4. 代码被合并后请主动删除分支;
