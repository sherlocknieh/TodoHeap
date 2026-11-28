// 任务图遍历: 父子关系与同级顺序由父节点的 child_ids 保存, 允许环与多个父节点; 顺序机制见 docs/src/content/docs/dev/logic/task-order.md
// 渲染时把图展开成森林: 每个任务首次出现为普通节点, 之后再次出现的引用收缩为回边节点

const EMPTY_IDS = []

const childIdsOf = (todo) => (Array.isArray(todo.child_ids) ? todo.child_ids : EMPTY_IDS)

// 沿 child_ids 收集后代; visited 保证环不会无限递归
export const collectDescendantIds = (items, rootId) => {
  const byId = new Map(items.map((item) => [item.id, item]))
  const visited = new Set([rootId])
  const descendants = []

  const walk = (id) => {
    const node = byId.get(id)
    if (!node) return
    childIdsOf(node).forEach((childId) => {
      if (visited.has(childId)) return
      visited.add(childId)
      descendants.push(childId)
      walk(childId)
    })
  }

  walk(rootId)
  return descendants
}

// 新增一条父链接是否成环: 子任务不能是自己, 也不能把父任务挂到自己的后代下。
// 历史数据里可能已有环, collectDescendantIds 的 visited 保证这里只遍历一次;
// 写入路径统一用它拦截, 机制见 docs/src/content/docs/dev/logic/task-cycle-guard.md
export const wouldCreateCycle = (items, parentId, childId) => {
  if (parentId == null || childId == null) return false
  if (String(parentId) === String(childId)) return true
  return collectDescendantIds(items, childId).some((id) => String(id) === String(parentId))
}

// 完成任务树时要写入的任务: 任务本身 + 全部后代里仍未完成的;
// 已完成的保留原完成时间, child_ids 里残留的已删除 ID 静默跳过
export const collectIncompleteTreeIds = (items, rootId) => {
  const byId = new Map(items.map((item) => [item.id, item]))
  if (!byId.has(rootId)) return []

  return [rootId, ...collectDescendantIds(items, rootId)]
    .filter((id) => byId.has(id) && !byId.get(id).completed_at)
}

// 反向查找直接父节点; 一个任务可以有多个父节点
export const findParentIds = (items, childId) => items
  .filter((item) => childIdsOf(item).includes(childId))
  .map((item) => item.id)

// 删除后的焦点落点: 兄弟顺序只看父级 child_ids, 先取下一个兄弟, 没有就上一个, 再没有回到父任务;
// 多父任务优先用 parentId 指定的展示父链, 根任务只作父级兜底、不返回为焦点。机制见 docs/src/content/docs/dev/logic/graph-delete-focus.md
export const findDeleteFocusId = (items, id, { parentId = null, preferNext = true } = {}) => {
  const byId = new Map(items.map((item) => [item.id, item]))
  if (!byId.has(id)) return null

  // 展示父链在前, 其它父级按发现顺序兜底; 已不存在的兄弟 ID(删除残留) 跳过
  const parents = findParentIds(items, id)
  const orderedParents = parentId != null && parents.includes(parentId)
    ? [parentId, ...parents.filter((pid) => pid !== parentId)]
    : parents

  for (const pid of orderedParents) {
    const parent = byId.get(pid)
    if (!parent) continue
    const siblings = childIdsOf(parent).filter((childId) => byId.has(childId))
    const index = siblings.indexOf(id)
    if (index === -1) continue
    const next = siblings[index + 1] ?? null
    const previous = siblings[index - 1] ?? null
    const sibling = preferNext ? (next ?? previous) : (previous ?? next)
    if (sibling != null) return sibling
  }

  // 兄弟都没了才落到父任务; 根任务不是真实任务, 返回 null 让详情面板收起
  const fallback = orderedParents
    .map((pid) => byId.get(pid))
    .find((parent) => parent && !parent.is_root)
  return fallback?.id ?? null
}

// 搜索/筛选共用：命中节点连同祖先链一起保留，父级只作上下文；回边行不重复计入结果。
// 列表页把返回值直接交给 TodoListItem 渲染，源树与折叠状态都不改。
const filterTaskTree = (nodes, predicate) => nodes.reduce((acc, node) => {
  if (node._isRef) return acc
  const children = filterTaskTree(node.children || [], predicate)
  if (predicate(node) || children.length) acc.push({ ...node, children })
  return acc
}, [])

// 按标题搜索：忽略大小写与首尾空白，空查询返回原树
export const filterTasksByTitle = (nodes, query) => {
  const keyword = String(query || '').trim().toLowerCase()
  if (!keyword) return nodes
  return filterTaskTree(nodes, (node) => (node.title || '').toLowerCase().includes(keyword))
}

// 服务端行里的负数子 ID 只可能是历史临时 ID 残留(临时 ID 从不落库), 不指向任何任务:
// 保留下来会和客户端新生成的临时 ID 撞号, ID 替换时把别的父级改错, 表现为多出一条幽灵链接
export const withoutStaleTempChildIds = (items) => items.map((item) => (
  Array.isArray(item.child_ids) && item.child_ids.some((id) => Number(id) < 0)
    ? { ...item, child_ids: item.child_ids.filter((id) => Number(id) >= 0) }
    : item
))

// 级联删除集合: 从 roots 出发, 只把没有其它父链接的后代加入集合。
// parentItems 用于判断“其它链接”, 默认与 items 相同; 永久删除时可传入已删除与未删除的全部任务。
export const collectCascadeIds = (items, rootIds, { parentItems = items } = {}) => {
  const byId = new Map(items.map((item) => [item.id, item]))
  const parentIdsOf = new Map()

  parentItems.forEach((item) => {
    childIdsOf(item).forEach((childId) => {
      if (!parentIdsOf.has(childId)) parentIdsOf.set(childId, new Set())
      parentIdsOf.get(childId).add(item.id)
    })
  })

  const deleting = new Set(rootIds.filter((id) => byId.has(id)))
  let changed = true

  while (changed) {
    changed = false
    ;[...deleting].forEach((id) => {
      const node = byId.get(id)
      if (!node) return
      childIdsOf(node).forEach((childId) => {
        if (deleting.has(childId) || !byId.has(childId)) return
        const parents = parentIdsOf.get(childId) || new Set()
        // 任一父级不在删除集合内, 说明还有别的链接, 子任务保留
        if ([...parents].some((parentId) => !deleting.has(parentId))) return
        deleting.add(childId)
        changed = true
      })
    })
  }

  return items.filter((item) => deleting.has(item.id)).map((item) => item.id)
}

const createBackReference = (parent, target) => ({
  id: `ref:${parent.id}:${target.id}`,
  title: target.title,
  details: '',
  completed_at: target.completed_at ?? null,
  deadline: target.deadline ?? null,
  duration: target.duration ?? null,
  created_at: target.created_at ?? null,
  parent_id: parent.id,
  _isRef: true,
  _refTargetId: target.id,
  children: []
})

// 把 child_ids 图展开成森林
// 无入边的任务作为根; 只有环、没有入边的连通块提升其中一个节点为环根
export const buildTaskForest = (items, { mapItem, sortFn, setNodeMeta } = {}) => {
  const nodes = new Map()
  const referenced = new Set()

  items.forEach((item) => {
    const node = { ...mapItem(item), children: [] }
    node._childIds = childIdsOf(item)
    nodes.set(item.id, node)
    childIdsOf(item).forEach((childId) => referenced.add(childId))
  })

  const visited = new Set()

  const attachChildren = (node) => {
    const children = node._childIds
      .map((childId) => nodes.get(childId))
      .filter(Boolean)

    if (sortFn) children.sort(sortFn)

    children.forEach((child) => {
      if (visited.has(child.id)) {
        node.children.push(createBackReference(node, child))
        return
      }
      visited.add(child.id)
      child.parent_id = node.id
      child._cycleRoot = false
      node.children.push(child)
      attachChildren(child)
    })
  }

  const absorb = (node, isCycleRoot) => {
    node.parent_id = null
    node._cycleRoot = isCycleRoot
    visited.add(node.id)
    roots.push(node)
    attachChildren(node)
  }

  const roots = []
  const ordered = sortFn ? [...items].sort(sortFn) : items

  ordered
    .filter((item) => !referenced.has(item.id))
    .forEach((item) => absorb(nodes.get(item.id), false))

  // 纯环没有自然根, 逐个提升未访问节点, 让整块图仍然可见
  ordered.forEach((item) => {
    if (visited.has(item.id)) return
    absorb(nodes.get(item.id), true)
  })

  if (setNodeMeta) {
    const walk = (arr, depth = 0) => {
      arr.forEach((node) => {
        setNodeMeta(node, depth)
        walk(node.children, depth + 1)
      })
    }
    walk(roots, 0)
  }

  return roots
}
