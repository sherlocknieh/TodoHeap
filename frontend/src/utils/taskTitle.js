// 连续新建任务时的标题编号: 参考标题末尾有数字就续号(步骤 2 → 步骤 3, 保留前导零),
// 没有末尾数字则用默认标题从 1 开始取最小未占用编号。同级顺序与标题都由父级 child_ids 给出。
// 被哪些地方依赖: TodoGraph.createTask、TodoList.addSubtask、Todo.vue.createNewTask。
// 机制见 docs/src/content/docs/dev/logic/task-create.md「连续新建时的标题编号」

// 没有同级参考时的默认标题，所有入口共用，保证新建结果一致
const DEFAULT_TITLE = '新任务'

// 已占用的同级标题从候选序列里跳过，避免连续新建出现重名
export const nextTaskTitle = (referenceTitle, siblingTitles = []) => {
  const used = new Set(siblingTitles.map((title) => (title || '').trim()))
  const reference = (referenceTitle || '').trim()
  const match = /^(.*?)(\d+)$/.exec(reference)

  if (match) {
    const [, prefix, digits] = match
    let value = Number(digits) + 1
    let candidate = `${prefix}${String(value).padStart(digits.length, '0')}`
    while (used.has(candidate)) {
      value += 1
      candidate = `${prefix}${String(value).padStart(digits.length, '0')}`
    }
    return candidate
  }

  let value = 1
  while (used.has(`${DEFAULT_TITLE} ${value}`)) value += 1
  return `${DEFAULT_TITLE} ${value}`
}

// 同级标题按父级 child_ids 的顺序取, 已删除/不存在的 ID 跳过
export const childTitlesOf = (items, parentId) => {
  const byId = new Map(items.map((item) => [item.id, item]))
  return (byId.get(parentId)?.child_ids || [])
    .map((id) => byId.get(id)?.title)
    .filter((title) => title != null)
}
