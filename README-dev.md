# PlayGround

项目试验场

# 后端

- 初始化: `supabase init`

### 连接项目
  - 登录账户: `npx supabase login [--no-browser]` 
  - 连接项目: `npx supabase link` 

### 数据库管理
  - 创建迁移脚本: `npx supabase migration new <title>`
  - 推送更改到远程: `npx supabase db push`
  - 重置远程数据库: `npx supabase db reset --remote`

### 边缘函数管理
  - 创建边缘函数: `npx supabase functions new hello-world`
  - 部署边缘函数: `npx supabase functions deploy hello-world`
  - 取消部署函数: `npx supabase functions delete hello-world`
  - [访问官方教程](https://supabase.com/docs/guides/functions/quickstart);

### 边缘函数 `dida_auth` 与 `mcp_gateway`
  - `dida_auth`: 滴答清单 OAuth 代理（注册客户端、PKCE 换令牌）
    - 部署: `npx supabase functions deploy dida_auth --use-api`
  - `mcp_gateway`: 通用 MCP 网关，转发任意服务的 JSON-RPC（滴答清单的 MCP 调用也走这里）
    - 部署: `npx supabase functions deploy mcp_gateway --use-api`
  - 本地打包报 `entrypoint path does not exist` 时改用服务端打包加 `--use-api`（路径含中文时必现）
  - 旧函数 `dida_mcp` 已拆分为上面两个，部署完成后可删除: `npx supabase functions delete dida_mcp`
  - 平台应用（可选但推荐）: 在滴答开放平台创建应用，回调地址填站点基路径（如 `https://<用户>.github.io/TodoHeap/`），再把凭据写入 Supabase secrets:
    `npx supabase secrets set DIDA_CLIENT_ID=... DIDA_CLIENT_SECRET=...`
  - 未配置凭据时退回动态注册的公开客户端（PKCE），部分账号可能无法完成换令牌，此时在设置页用「改用访问令牌连接」粘贴令牌

### 客户端接入准备
- 获取 `Project URL` 和 `Publishable Key`:
  - 在项目主页顶部 `Connect` 按钮中 `API Keys` 子选项卡获取
  - 填入 .env 文件: (遵循 Vite 项目规范, 以 `VITE_` 开头)
    ```
    VITE_SUPABASE_URL=<Project URL>
    VITE_SUPABASE_KEY=<Publishable Key>
    ```
- 关闭 `Confirm email` 选项:
  - 在 `<项目主页>/auth/providers` 中关闭
  - 可简化注册流程, 并避免回调 URL 与哈希路由不兼容的问题

- 配置注册回调 URL:
  - 在 `<项目主页>/auth/url-configuration` 的 `Redirect URLs` 区域添加:
  - `http://localhost:*/**`  (本地开发)
  - `https://*.github.io/**` (生产环境)
  - 客户端注册时要指定回调 URL:
    ```ts
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/PlayGround/`, // 注册成功后重定向的 URL
      },
    })
    ```
  - 完成这些配置后, 才建议开启 `Confirm email` 功能, 否则用户注册成功后无法正确回到应用, 会以为注册失败.

### TypeScript 类型支持
  - 为表格生成TS类型: `npx supabase gen types typescript --linked --schema public > src/lib/database.types.ts`
  - 使用方法: 
    ```ts
    import type { Database } from '@/lib/database.types'
    type Task = Database['public']['Tables']['tasks']['Row']
    // 或者
    import type { Tables } from '@/lib/database.types'
    type Task = Tables<'tasks'>
    ```
  - 每次修改数据库结构后, 记得重新生成类型定义文件, 以保持类型的准确性. 
  - 官方的定义中可能存在 Json 递归类型定义, 建议手动改写 `json` 类型为 `Record<string, unknown>`, 避免"类型实例化过深"问题.

# 前端

- 初始化: `npm create vite@latest`
  - Project name: `.`
  - Package name: `playground`
  - Framework: `Vue`
  - Language: `TypeScript`
- 引入第三方库:
  - tailwindcss: `npm install tailwindcss @tailwindcss/vite`
  - vue-router: `npm install vue-router@4`
  - supabase-js: `npm install @supabase/supabase-js`
  - pinia: `npm install pinia`




## 开发指南

### 依赖环境

```powershell
# 安装 Node.js（建议 16+ 或 18+ LTS）
# 访问官网 https://nodejs.org/ 下载并安装，或使用系统包管理器
# Windows 可用 winget 安装：
winget install OpenJS.NodeJS

# 推荐使用 pnpm 管理依赖（也支持 npm/yarn）
npm install -g pnpm

# （可选）配置国内镜像以加速依赖下载：
npm config set registry https://registry.npmmirror.com
```


### 前端开发

- 以 `frontend` 为工作目录
- 开发指南: [frontend/README.md](frontend/README.md)

快速运行（开发）：

```bash
cd frontend
pnpm install
pnpm dev
```

如果使用 `npm`：

```bash
cd frontend
npm install
npm run dev
```

本地开发需要在 `frontend` 中配置环境变量文件 `.env.local`，示例位于 `frontend/README.md`。

### 文档开发

- 以 `docs` 为工作目录
- 开发指南: [docs/README.md](docs/README.md)

快速预览文档（使用 VitePress）：

```bash
cd docs
pnpm install
pnpm dev
# 打开浏览器访问 http://localhost:5173
```

### 前端和文档联合开发

- 在项目根目录可以同时启动前端与文档（需分别在各目录安装依赖）：

```bash
# 启动前端（新终端）
cd frontend && pnpm dev

# 启动文档（新终端）
cd docs && pnpm dev
```


### 后端开发

#### 在线/远程 Supabase

- 项目托管在 Supabase（限定访问），如需管理权限请使用项目维护者提供的联系方式。

#### 本地 Supabase 开发

- 使用 Supabase CLI 进行本地或远程项目管理。示例：

```bash
# 登录到 Supabase（交互式）
npx supabase login

# 将本地仓库与 Supabase 项目关联（会有交互提示）
npx supabase link

# 创建数据库迁移
npx supabase migration new your_migration_name

# 将本地迁移推送到项目（谨慎操作）
npx supabase db push
```

边缘函数（Edge Functions）开发示例：

```bash
# 新建函数
npx supabase functions new my-function

# 部署函数
npx supabase functions deploy my-function
```

注意：操作 Supabase CLI 可能需要你具有相应项目的权限和访问密钥，请向项目维护者获取。

### 提交指南

1. 到 Issue 页面查看/创建/认领任务。
2. Fork 项目到自己的仓库并创建新分支开始开发。
3. 完成开发后提交 PR（Pull Request）并填写变更说明。
4. 代码合并后可删除分支并关闭对应 Issue。
