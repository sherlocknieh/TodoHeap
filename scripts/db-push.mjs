// 远程迁移推送：连接串由 node --env-file-if-exists 从 .env.local 读入，
// 避免每次手动 source，也避免密码写进命令行历史。额外参数会透传给 db push（如 --dry-run）。
import { spawnSync } from 'node:child_process'

const url = process.env.SUPABASE_DB_URL

if (!url) {
  console.error('缺少 SUPABASE_DB_URL，请在仓库根目录创建 .env.local（写法见 README-dev.md）')
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
