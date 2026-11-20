// 关键词索引锚点校验
// 依赖 docs/src/content/docs/dev/keyword-index.md 的「位置」列写法：`代码路径`「注释原文」或 [文档](./x.md)「标题」
// 被 package.json 的 "check:keywords" 调用；锚点随代码改动失效时以退出码 1 拦住提交

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const DOC = path.join(ROOT, 'docs/src/content/docs/dev/keyword-index.md')
const DOC_DIR = path.dirname(DOC)

// 位置列里「路径 + 紧跟其后的锚点」，锚点可以连写多个
const CODE_PAIR = /`([^`]+)`((?:「[^」]+」)+)/g
const DOC_PAIR = /\[[^\]]+\]\(([^)]+\.md)\)((?:「[^」]+」)+)/g

const read = (file) => readFileSync(file, 'utf8')
const anchorsOf = (raw) => [...raw.matchAll(/「([^」]+)」/g)].map((m) => m[1])

// 代码路径在索引里简写为相对 frontend/src，兜底再按仓库根解析
const resolveCode = (p) =>
  [path.join(ROOT, 'frontend/src', p), path.join(ROOT, p)].find(existsSync)

const failures = []
let total = 0

const check = (lineNo, where, file, anchor) => {
  total += 1
  if (!file) return failures.push({ lineNo, where, anchor, reason: '文件不存在' })
  if (!read(file).includes(anchor))
    failures.push({ lineNo, where, anchor, reason: '锚点不存在' })
}

read(DOC)
  .split('\n')
  .forEach((line, i) => {
    // 只看表格行的「位置」列（第 2 列）
    if (!line.startsWith('| ')) return
    const cells = line.replace(/^\||\|$/g, '').split('|')
    if (cells.length < 3) return
    const location = cells[1]
    const lineNo = i + 1

    for (const [, p, raw] of location.matchAll(CODE_PAIR)) {
      const file = resolveCode(p)
      for (const anchor of anchorsOf(raw)) check(lineNo, `\`${p}\``, file, anchor)
    }
    for (const [, p, raw] of location.matchAll(DOC_PAIR)) {
      const file = path.resolve(DOC_DIR, p)
      for (const anchor of anchorsOf(raw)) check(lineNo, p, file, anchor)
    }
  })

if (failures.length) {
  console.error(`✗ 关键词索引有 ${failures.length}/${total} 条锚点失效：`)
  for (const { lineNo, where, anchor, reason } of failures)
    console.error(`  keyword-index.md:${lineNo}  ${where}「${anchor}」 ${reason}`)
  console.error('修正代码注释与索引其中一侧，或改掉索引里的锚点原文。')
  process.exit(1)
}

console.log(`✓ 关键词索引校验通过：${total} 条锚点全部命中`)
