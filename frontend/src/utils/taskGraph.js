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

// 反向查找直接父节点; 一个任务可以有多个父节点
export const findParentIds = (items, childId) => items
  .filter((item) => childIdsOf(item).includes(childId))
  .map((item) => item.id)

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
