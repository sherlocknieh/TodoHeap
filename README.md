# TodoHeap 任务堆

- 在普通 TodoList 应用的基础上添加 AI 自动分解任务的功能;
- 把大任务自动分解细化为能快速完成的小任务, 减轻任务管理压力;
- 找出最优先的任务置于最顶端, 省去在多个平行任务中做选择的精力;


## 已实现功能

- 用户注册登录 (Supabase Auth)
- 单层任务的增删


## TODO

- 任务的编辑和详细管理
- 子任务的创建和显示
- 子任务的拖拽排序
- 任务优先级排序算法
- AI 自动分解任务 (OpenAI API)


## 开发指南


### 前端

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
- 运行
    ```bash
    cd frontend; npm run dev
    ```
- 本地调试: http://localhost:5174/
- 在线访问: https://sherlocknieh.github.io/TodoHeap/

### 后端

- 注册登录 [Supabase](https://supabase.com/);
- 访问 [Supabase Dashboard](https://supabase.com/dashboard/) 即可开始管理数据库;

用 Python 进行本地调试:

- 安装 Python 和 uv
    ```powershell
    winget install python3 uv
    ```
- 安装依赖
    ```bash
    cd backend; uv sync
    ```
- 运行
    ```bash
    cd backend; uv run main.py
    ```
