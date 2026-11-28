// 剪贴板文本 → 待建任务树：Markdown 列表按缩进还原层级，其它纯文本整体作为单个节点标题。
// 被哪些地方依赖: MindMapWrapper 的 Ctrl+V 粘贴（onPaste）、TodoGraph.createTask 的 paste 分支。
// 机制见 docs/src/content/docs/dev/logic/graph-paste.md

// 列表项：允许 -、*、+ 与 1. / 1) 序号，缩进只用前面的空白衡量
const LIST_ITEM = /^([ \t]*)(?:[-*+]|\d+[.)])\s+(.*)$/

// 纯文本标题：节点标题是单行的，换行与连续空白压成一个空格
const singleLine = (text) => text.replace(/\s+/g, ' ').trim()

// 去掉空标题的项，把它的子级接到上一层，避免粘贴出一串空任务
const pruneEmpty = (nodes) => nodes.flatMap((node) => {
  const children = pruneEmpty(node.children || [])
  return node.title ? [{ ...node, children }] : children
})

// 按缩进栈还原树：缩进变浅就回退到同级，变深就挂到上一项下面
const parseList = (items) => {
  const roots = []
  const stack = []
  for (const item of items) {
    while (stack.length && item.indent <= stack[stack.length - 1].indent) stack.pop()
    const node = { title: singleLine(item.title), children: [] }
    if (stack.length) stack[stack.length - 1].node.children.push(node)
    else roots.push(node)
    stack.push({ indent: item.indent, node })
  }
  return pruneEmpty(roots)
}

// 首个非空行是列表项才按列表解析，否则整段文本当作一个标题
export const parsePastedTasks = (text) => {
  const raw = String(text ?? '')
  // 制表符按两个空格折算，与复制时的缩进单位一致
  const lines = raw.split(/\r?\n/).map((line) => line.replace(/\t/g, '  '))
  const items = []
  if (LIST_ITEM.test(lines.find((line) => line.trim()) || '')) {
    for (const line of lines) {
      const match = LIST_ITEM.exec(line)
      if (match) items.push({ indent: match[1].length, title: match[2] })
    }
  }

  const roots = items.length ? parseList(items) : []
  if (roots.length) return roots

  const title = singleLine(String(text ?? ''))
  return title ? [{ title, children: [] }] : []
}
