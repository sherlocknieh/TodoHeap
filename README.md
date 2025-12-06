# TodoHeap 任务堆

- 在普通 TodoList 应用的基础上添加 AI 自动分解任务的功能;
- 把大任务自动分解细化为能快速完成的小任务, 减轻任务管理压力;
- 找出最优先的任务置于最顶端, 省去在多个平行任务中做选择的精力;

## 开发指南

### 前端 (Vue)

- 安装 Node.js
    ```powershell
    winget install OpenJS.NodeJS
    # 配置 npm 源为国内镜像
    npm config set registry https://registry.npmmirror.com
    ```
- 安装项目依赖
    ```bash
    cd frontend; npm install
    ```
- 运行
    ```bash
    cd frontend; npm run dev
    ```
- 本地调试: http://localhost:5174/
- 在线访问: https://sherlocknieh.github.io/TodoHeap/

### 后端 (Supabase)

- 注册 [Supabase](https://supabase.com/) 并登录;
- 把注册邮箱发给我, 我把该账户添加为项目成员;
- 访问 [Supabase Dashboard](https://supabase.com/dashboard/) 即可开始管理数据库;

用 Python 进行本地调试:

- 安装uv
    ```powershell
    winget install uv
    ```
- 安装依赖
    ```bash
    cd backend; uv sync
    ```
- 运行
    ```bash
    cd backend; uv run main.py
    ```

### 代码提交

1. Fork本仓库到个人仓库 (或者联系我成为项目管理员);
2. 在个人仓库上进行开发 (管理员直接克隆本仓库开发);
3. 开发任何新功能前都创建一个新分支:
    ```bash
    git checkout -b feature/your-feature-name
    ```
4. 在分支上开发完成后推送到个人仓库;
5. 创建 Pull Request 并等待合并;
6. 代码被合并后即可删除分支:
    ```bash
    # 本地删除分支
    git branch -d feature/your-feature-name
    # 远程删除分支
    git push origin --delete feature/your-feature-name
    ```
