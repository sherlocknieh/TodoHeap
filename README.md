# TodoHeap 任务堆


## 快速链接

- **应用首页**: https://sherlocknieh.github.io/TodoHeap/
- **在线文档**: https://sherlocknieh.github.io/TodoHeap/docs/zh/


## 项目简介

![TodoHeap 主页面截图](docs/public/screenshot.png)


- **核心功能**: 在传统 TodoList 上增加 AI 任务分解的功能, 减轻人脑在任务管理上耗费的精力;

- **特色功能**: 以思维导图方式展示和管理任务树, 帮助你高效地整理思路;

- **特色功能**: 以堆视图可视化展示最优先的任务, 破解你的选择困难症;

## 项目目标

- 本项目的终极目标: 
  - 解决现代人类由于多任务压力造成的拖延, 焦虑, 失眠问题;
- 核心思路: 
  - 用AI接管多任务管理的复杂性, 让用户能更专注于任务执行本身;
- 终极效果: 
  - 输入过程: 用户只需用自然语言输入任务, 等待系统自动整理优化和安排, 本人极少需要介入任务管理过程;
  - 执行过程: 用户只需每天按系统推荐的优先级顺序消除当日任务, 夜间即可不受未完成感的困扰, 安然入睡;
- 由于输入过程只需一股脑地把任务扔进堆里, 执行过程只需无脑地从堆顶取任务, 因此取名为 TodoHeap 任务堆;



## 开发指南

### 依赖环境

  ```powershell
  # 安装 Node.js
  # 访问官网 https://nodejs.org/ 下载安装;
  # 如果是 Win11 可用 winget 命令快速安装:
  winget install OpenJS.NodeJS

  # 配置国内镜像源, 提高第三方库的下载速度
  npm config set registry https://registry.npmmirror.com

  # 安装 pnpm 包管理器替代 npm
  npm install -g pnpm
  ```


### 前端开发

- 以 frontend 为工作目录
- 开发指南: [frontend/README.md](frontend/README.md)

### 文档开发

- 以 docs 为工作目录
- 开发指南: [docs/README.md](docs/README.md)

### 前端和文档联合开发:

- 在项目根目录运行 `pnpm dev` 同时预览前端和文档;


### 后端开发

#### 在线开发:

- 项目地址: https://supabase.com/dashboard/project/nxzvisuvwtsnlrugqghx

- 获取项目管理权限: 用你的注册邮箱联系我 sherlocknieh@gmail.com

#### 本地开发:
  - 安装 Node.js;
  - 以当前目录为工作目录;

  - 连接到 Supabase 账户:
    ```bash
    npx supabase login --no-browser
    # --no-browser 是可选参数, 不想用默认浏览器登录时使用
    ```
  - 连接到项目
    ```bash
    npx supabase link
    # 会有交互式提示, 选择对应的项目即可
    ```

  - 数据库开发 [(官方教程)](https://supabase.com/docs/guides/local-development/overview#database-migrations):
    ```bash
    # 创建数据库管理脚本:
      npx supabase migration new your_migration_name
    # 编辑 PostgreSQL 脚本: supabase/migrations/**your_migration_name.sql;
    # 推送到远程:
      npx supabase db push
    # https://supabase.com/docs/reference/cli/supabase-db
    ```

  - 边缘函数开发 [(官方教程)](https://supabase.com/docs/guides/functions/quickstart);
    ```bash
    # 创建边缘函数:
    npx supabase functions new hello-world
    # 编辑边缘函数: supabase/functions/hello-world/index.ts
    # 部署边缘函数:
    npx supabase functions deploy hello-world
    # 取消部署:
    npx supabase functions delete hello-world
    ```

### 提交指南


1. 到 Issue 页面查看/创建/认领任务;

2. Fork 项目到自己的仓库, 创建新分支开始开发;

4. 发布分支后, 向主仓库提 Pull Request;

5. 代码被合并后可删除分支, 关闭对应的 Issue;
