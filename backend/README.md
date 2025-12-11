# TodoHeap 后端

- 使用 Supabase 云数据库

- 本地用 Python 快速调试:

    - 安装依赖
        ```bash
        uv sync
        ```
    - 运行
        ```bash
        uv run main.py
        ```

- API文档

- 基本查询
    - 获取所有任务: `/api/todos`
    - 获取单个任务: `/api/todo/{id}`
    - 创建任务: `/api/todo/create`
    - 更新任务: `/api/todo/update/{id}`
    - 删除任务: `/api/todo/delete/{id}`