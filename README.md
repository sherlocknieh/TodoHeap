# TodoHeap 任务堆

## 开发指南

### 前端

- 安装 Node.js
- 安装项目依赖
    ```bash
    cd frontend
    npm install
    ```
- 运行
    ```bash
    cd frontend
    npm run dev
    ```
- 本地调试: http://localhost:5173/TodoHeap/
- 在线访问: https://sherlocknieh.github.io/TodoHeap/


### 后端

- 安装 Python3
- 安装 uv
- 安装项目依赖
    ```bash
    cd backend
    uv sync
    ```
- 运行
    ```bash
    cd backend
    uv run main.py
    ```
- 本地调试: http://localhost:8000/


### 数据库

- 注册 [Supabase](https://supabase.com/) 并登录;
- 告诉我你的注册邮箱, 我把你添加为项目管理员;
- 访问 [TodoHeap](https://supabase.com/dashboard/project/nxzvisuvwtsnlrugqghx) 开始管理数据库;


### 代码提交

1. Fork此仓库到你的仓库 (or 联系我成为项目管理员)
2. 在你的仓库上进行开发 (管理员可直接克隆主仓库开发)
3. 开发任何新功能前都创建一个新分支
4. 在分支上开发完成后推送到你的仓库
5. 创建 Pull Request 并等待合并