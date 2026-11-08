// 任务图遍历: 父子关系由父节点的 child_ids 保存, 允许环与多个父节点
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

const createBackReference = (parent, target) => ({
  id: `ref:${parent.id}:${target.id}`,
  title: target.title,
  details: '',
  completed_at: target.completed_at ?? null,
  deadline: target.deadline ?? null,
  sort_order: target.sort_order ?? null,
  difficulty: target.difficulty ?? null,
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
