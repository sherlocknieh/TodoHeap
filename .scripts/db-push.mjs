// 远程迁移推送脚本
// 依赖 .env.local 中 SUPABASE_DB_URL 变量
// 被 package.json 中的 "db:push" 命令调用

import { spawnSync } from 'node:child_process'

const url = process.env.SUPABASE_DB_URL

if (!url) {
  console.error('缺少 SUPABASE_DB_URL，请在仓库根目录创建 .env.local（写法见 README-dev.md）')
  // 创建 .env.local 模板
  const fs = await import('node:fs/promises')
  await fs.writeFile('.env.local',
    '# 数据库迁移时用的远程连接地址和密码\n# 被依赖于 .scripts/db-push.mjs\nSUPABASE_DB_URL="postgresql://<user>:<password>@<host>:<port>/<database>"\n') 
  process.exit(1)
}

const extraArgs = process.argv.slice(2)
// npm/nub 透传参数时会先塞一个分隔符，supabase 不认，去掉
if (extraArgs[0] === '--') extraArgs.shift()

const result = spawnSync(
  'npx',
  ['supabase', 'db', 'push', '--yes', '--remote', url, ...extraArgs],
  { stdio: 'inherit' }
)

process.exit(result.status ?? 1)
