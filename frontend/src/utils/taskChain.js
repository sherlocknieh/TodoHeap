// 父链展示: 只读任务数据, 供详情右栏标题上方的小字与「多父」展开列表使用。
// 数据里 child_ids 是唯一父子来源, 任务可有多个父级、也可成环(见 docs/src/content/docs/dev/logic/task-order.md),
// 所以「完整父链」是若干条根到任务的简单路径, 这里分别给出展示主链与全部路径。
// 机制见 docs/src/content/docs/dev/logic/task-chain.md

const childIdsOf = (todo) => (Array.isArray(todo?.child_ids) ? todo.child_ids : [])

const toNode = (todo) => ({ id: todo.id, title: todo.title || '' })

// 展示主链: 沿 buildTaskForest 写回的首现 parent_id 回溯, 与列表/导图当前展示的那条链一致;
// 根任务「全部任务」不算链首, 首现节点缺失(回收站任务)或成环时停止。返回根 → 最近父级。
export const displayChainOf = (treeNodes, id) => {
  if (id == null) return []

  // 只收首现实体节点; 回边节点(_isRef)是同一任务的再次出现, 不作为首现父级来源
  const index = new Map()
  const walk = (nodes) => {
    ;(nodes || []).forEach((node) => {
      if (!node || node._isRef) return
      if (!index.has(String(node.id))) index.set(String(node.id), node)
      walk(node.children)
    })
  }
  walk(treeNodes)

  const start = index.get(String(id))
  if (!start) return []

  const seen = new Set([String(id)])
  const chain = []
  let current = start
  while (current?.parent_id != null) {
    const parent = index.get(String(current.parent_id))
    if (!parent || parent.is_root || seen.has(String(parent.id))) break
    seen.add(String(parent.id))
    chain.push(toNode(parent))
    current = parent
  }
  return chain.reverse()
}

// 全部父链: 枚举根到任务的简单路径, 多父角标按此计数并展开。
// 深度与条数都封顶, 超出时 truncated=true; 回到已走过的节点记为成环(cycle=true)并停止该分支。
export const allChainsOf = (items, id, { maxDepth = 20, maxPaths = 20 } = {}) => {
  const list = Array.isArray(items) ? items : []
  const byId = new Map()
  list.forEach((item) => {
    if (item?.id == null) return
    if (!byId.has(String(item.id))) byId.set(String(item.id), item)
  })
  if (id == null || !byId.has(String(id))) return { chains: [], truncated: false }

  // 根任务是系统节点, 所有顶层任务都以它为父级; 它不参与父链展示
  const rootKey = list.find((item) => item?.is_root)?.id
  const rootKeyStr = rootKey == null ? null : String(rootKey)

  // 父级索引: 一个任务可有多个父级, 顺序沿用 items 顺序; 残留或未知 ID 跳过
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

  const chains = []
  let truncated = false

  // 自当前任务向上走: 到根任务或无父级即链尾; 环只标记一次, 不再展开
  const walk = (key, nearToFar, pathSet) => {
    if (chains.length >= maxPaths) {
      truncated = true
      return
    }

    const parentKeys = (parentsOf.get(key) || []).filter((parentKey) => parentKey !== rootKeyStr)
    if (parentKeys.length === 0) {
      chains.push({
        nodes: nearToFar.map((pid) => toNode(byId.get(pid))).reverse(),
        cycle: false
      })
      return
    }

    parentKeys.forEach((parentKey) => {
      if (pathSet.has(parentKey)) {
        chains.push({
          nodes: nearToFar.map((pid) => toNode(byId.get(pid))).reverse(),
          cycle: true
        })
        return
      }
      if (nearToFar.length >= maxDepth) {
        truncated = true
        return
      }
      walk(parentKey, [...nearToFar, parentKey], new Set([...pathSet, parentKey]))
    })
  }

  walk(String(id), [], new Set([String(id)]))

  // 顶层任务只有根任务父级时会出现空链, 没有展示价值
  return { chains: chains.filter((chain) => chain.nodes.length > 0 || chain.cycle), truncated }
}
