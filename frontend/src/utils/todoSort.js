// 清单排序：只重排同级兄弟，引用行固定排在末尾，子树递归排序
export const LIST_SORT_OPTIONS = [
  { value: 'manual', label: '手动顺序' },
  { value: 'deadline', label: '按截止时间' },
  { value: 'created', label: '按创建时间' },
  { value: 'difficulty', label: '按难度' }
]

const toTimestamp = (value) => {
  // 空值统一视为「无限远」，让无期限任务排在末尾
  if (!value) return Number.POSITIVE_INFINITY
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time
}

// 两个「无限远」相减会得到 NaN，必须显式返回 0 保持原有相对顺序
const compareFinite = (a, b) => {
  if (a === b) return 0
  return a - b
}

const compareByDeadline = (a, b) => compareFinite(toTimestamp(a.deadline), toTimestamp(b.deadline))

const compareByCreated = (a, b) => {
  const aTime = toTimestamp(a.created_at)
  const bTime = toTimestamp(b.created_at)
  // 创建时间倒序：新任务排在前面
  if (!Number.isFinite(aTime)) return 1
  if (!Number.isFinite(bTime)) return -1
  return bTime - aTime
}

const compareByDifficulty = (a, b) => {
  const normalise = (value) => (value == null || !Number.isFinite(Number(value)) ? Number.POSITIVE_INFINITY : Number(value))
  return compareFinite(normalise(a.difficulty), normalise(b.difficulty))
}

const COMPARATORS = {
  deadline: compareByDeadline,
  created: compareByCreated,
  difficulty: compareByDifficulty
}

export const sortTodoTree = (nodes, mode) => {
  const compare = COMPARATORS[mode]
  if (!compare) return nodes

  const sortLevel = (levelNodes) => [...levelNodes]
    .sort((a, b) => {
      if (Boolean(a._isRef) !== Boolean(b._isRef)) return a._isRef ? 1 : -1
      return compare(a, b)
    })
    .map(node => ({ ...node, children: sortLevel(node.children || []) }))

  return sortLevel(nodes)
}
