# TodoHeap 任务堆


![TodoHeap 主页面截图](docs/src/main-page.png)

- **核心功能**: 在 TodoList 上增加 AI 自动分解任务的功能, 减轻任务管理压力;

- **特色功能**: 以思维导图方式展示和管理任务树, 帮助你理清思路;

- **特色功能**: 以堆视图可视化展示最优先的任务, 破解你的选择困难症;


## 快速链接

- **应用首页**: https://sherlocknieh.github.io/TodoHeap/
- **在线文档**: https://sherlocknieh.github.io/TodoHeap/docs/


## 项目目标

- 本项目的终极目标: 
  - 解决现代人类由于多任务压力造成的拖延, 焦虑, 失眠问题;
- 核心思路: 
  - 用AI接管多任务管理的复杂性, 让用户能更专注于任务执行本身;
- 终极效果: 
  - 输入过程: 用户只需用自然语言输入任务, 等待系统自动优化和安排, 本人极少需要介入任务管理过程;
  - 执行过程: 用户只需每天按系统推荐的优先级顺序消除当日任务, 夜间即可不受未完成感的困扰, 安然入睡;
  - 输入过程只需一股脑地把任务扔进堆里, 执行过程只需无脑地从堆顶取任务, 因此命名为 TodoHeap 任务堆;




## 开发指南

### 前端开发

- 安装 Node.js
  ```powershell
  winget install OpenJS.NodeJS
  ```
- 进入前端项目目录
  ```bash
  cd frontend
  ```
- 安装前端项目依赖
  ```bash
  # 使用国内镜像加速下载
  npm config set registry https://registry.npmmirror.com
  # 安装依赖
  npm install
  ```
- 本地调试运行
  ```bash
  npm run dev
  ```


### 后端开发

- 注册登录 [Supabase](https://supabase.com/);
- 联系我获取此项目的管理权限: sherlocknieh@gmail.com
- 在线开发:
    - https://supabase.com/dashboard/project/nxzvisuvwtsnlrugqghx
- 本地开发:
  - 安装supabase-cli:
    ```bash
    npx supabase
    ```
  - 本地编写SQL脚本: supabase/migrations/;
    ```bash
    # 创建新的SQL变更脚本
    npx supabase migration new your_migration_name
    ```
  - 本地编写边缘函数: supabase/functions/;
  - 推送到远程:
    ```bash
    # 登录
    npx supabase login
    # 连接到项目
    npx supabase link --project-ref nxzvisuvwtsnlrugqghx
    # 推送数据库更改
    npx supabase db push
    # 创建边缘函数
    npx supabase functions new hello-world
    # 部署边缘函数
    npx supabase functions deploy hello-world
    # 部署所有边缘函数
    npx supabase functions deploy
    ```
  - 参考 [supabase-cli 官方文档](https://supabase.com/docs/reference/cli/supabase-login);
  - 参考 [边缘函数官方教程](https://supabase.com/docs/guides/functions/quickstart);

  - 要取消部署某个边缘函数, 不可直接删除文件夹, 需用命令行取消部署, 然后手动删除函数文件夹;
    如果直接手动删除函数文件夹, config.toml 中仍会残留该函数的记录, 导致github在线部署时报错;
    ```bash
     # 取消部署
     npx supabase functions delete hello-world
    ```


### 在线文档

- 在 docs/ 下创建和编辑 Markdown 文档;
- 推送到 GitHub 后会自动部署为在线文档;
- 本地预览:
  ```bash
  pip install -r docs/requirements.txt
  mkdocs serve
  ```

### 提交指南

1. 先到 Issue 页面查看/创建/认领任务: https://github.com/sherlocknieh/TodoHeap/issues

2. 本地创建新分支并开始工作:
   ```bash
   git checkout -b <分支名>
   ```

3. 发布分支后到仓库分支页面提 Pull Request:
   https://github.com/sherlocknieh/TodoHeap/branches/yours

4. 代码被合并后可删除分支;
