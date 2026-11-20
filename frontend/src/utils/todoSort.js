// 清单排序：只重排同级兄弟，引用行固定排在末尾，子树递归排序；手动顺序不经过这里
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

// 降序也把没有截止时间的任务留在末尾，不能简单反转比较结果
const compareByDeadlineDesc = (a, b) => {
  const aTime = toTimestamp(a.deadline)
  const bTime = toTimestamp(b.deadline)
  if (aTime === bTime) return 0
  if (!Number.isFinite(aTime)) return 1
  if (!Number.isFinite(bTime)) return -1
  return bTime - aTime
}

const compareByCreated = (a, b) => {
  const aTime = toTimestamp(a.created_at)
  const bTime = toTimestamp(b.created_at)
  // 创建时间倒序：新任务排在前面
  if (!Number.isFinite(aTime)) return 1
  if (!Number.isFinite(bTime)) return -1
  return bTime - aTime
}

const compareByDuration = (a, b) => {
  const normalise = (value) => (value == null || !Number.isFinite(Number(value)) ? Number.POSITIVE_INFINITY : Number(value))
  return compareFinite(normalise(a.duration), normalise(b.duration))
}

const COMPARATORS = {
  deadline: compareByDeadline,
  'deadline-desc': compareByDeadlineDesc,
  created: compareByCreated,
  duration: compareByDuration
}

// 日期筛选的展示：把整棵树里带截止时间的任务收集成平铺列表，按截止时间整体排序，不再保留层级。
// 返回的都是叶子行（children 为空），列表页直接渲染，不参与缩进与树状连线。
export const flattenTasksByDeadline = (nodes, { descending = false } = {}) => {
  const compare = descending ? compareByDeadlineDesc : compareByDeadline
  const collect = (list) => list.reduce((acc, node) => {
    if (!node._isRef) acc.push(node)
    return acc.concat(collect(node.children || []))
  }, [])

  return collect(nodes)
    .filter((node) => Boolean(node.deadline))
    .sort(compare)
    .map((node) => ({ ...node, children: [] }))
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
