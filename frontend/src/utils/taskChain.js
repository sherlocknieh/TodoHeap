// 父链展示: 只读任务数据, 供详情右栏标题上方的小字使用。
// 数据里 child_ids 是唯一父子来源, 任务可有多个父级、也可成环(见 docs/src/content/docs/dev/logic/task-order.md),
// 所以「完整父链」是若干条根到任务的简单路径; 展示时去重成按跳数分层的「大致路径」。
// 机制见 docs/src/content/docs/dev/logic/task-chain.md

const childIdsOf = (todo) => (Array.isArray(todo?.child_ids) ? todo.child_ids : [])

const toNode = (todo) => ({ id: todo.id, title: todo.title || '' })

// 父级索引: 一个任务可有多个父级, 顺序沿用 items 顺序; 残留或未知 ID 跳过。
// 根任务是系统节点, 所有顶层任务都以它为父级, 它不参与父链展示。
const buildParentIndex = (items) => {
  const list = Array.isArray(items) ? items : []
  const byId = new Map()
  list.forEach((item) => {
    if (item?.id == null) return
    if (!byId.has(String(item.id))) byId.set(String(item.id), item)
  })

  const rootKey = list.find((item) => item?.is_root)?.id
  const rootKeyStr = rootKey == null ? null : String(rootKey)

  const parentsOf = new Map()
  list.forEach((item) => {
    childIdsOf(item).forEach((childId) => {
      const childKey = String(childId)
      if (!byId.has(childKey)) return
      if (!parentsOf.has(childKey)) parentsOf.set(childKey, [])
      const parents = parentsOf.get(childKey)
      const parentKey = String(item.id)
      if (!parents.includes(parentKey)) parents.push(parentKey)
    })
  })

  return { byId, rootKeyStr, parentsOf }
}

// 祖先层: DAG 去重后按「距当前任务的跳数」分层, 同层是并列可选的父级。
// 每层内保持 items 顺序; 距任务最远的一层排在前面, 用来拼出多行「大致路径」。
// 深度与唯一祖先数都封顶; 超出时 truncated=true。环因节点只记录一次而自然终止。
export const ancestorLayersOf = (items, id, { maxDepth = 20, maxNodes = 40 } = {}) => {
  const { byId, rootKeyStr, parentsOf } = buildParentIndex(items)
  if (id == null || !byId.has(String(id))) return { layers: [], truncated: false }

  // 从当前任务向上做 BFS: 首次到达的深度就是最短跳数, 同一祖先只保留一份
  const depthOf = new Map([[String(id), 0]])
  const layers = new Map()
  const queue = [String(id)]
  let truncated = false

  while (queue.length) {
    const key = queue.shift()
    const depth = depthOf.get(key)
    if (depth >= maxDepth) {
      truncated = true
      continue
    }

    for (const parentKey of parentsOf.get(key) || []) {
      if (parentKey === rootKeyStr || depthOf.has(parentKey)) continue
      if (depthOf.size > maxNodes) {
        truncated = true
        break
      }
      depthOf.set(parentKey, depth + 1)
      if (!layers.has(depth + 1)) layers.set(depth + 1, [])
      layers.get(depth + 1).push(toNode(byId.get(parentKey)))
      queue.push(parentKey)
    }
  }

  // 距任务最远的一层在前, 最近父级在最后
  const ordered = [...layers.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, nodes]) => nodes)

  return { layers: ordered, truncated }
}
