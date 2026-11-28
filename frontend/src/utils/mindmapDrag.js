// 任务图拖拽命中：把父级可见子级列里的空白也算作父节点的落点。
// 供 MindMapWrapper 使用；输入是当前布局节点与拖拽影子矩形。
// 「影子碰到节点」由 linkTargetAtRect 先行判定，本函数只在未接触任何节点时调用：
// 影子纵向落在某个父级的子级列内（首子级上缘到末子级下缘，首尾外侧各留 padding），
// 且与子级列横向重叠时，命中该父级，并给出插入槽位（第 index 个可见子级之前）。
// 命中规则说明见 docs/src/content/docs/dev/logic/graph-drag-hit.md

const isRealNode = (node) => !node.isRef && !node.isPlaceholder

export const findChildGapTarget = ({
  nodes,
  rect,
  nodeWidth,
  sourceId = null,
  padding = 0
}) => {
  const childrenByParent = new Map()
  for (const node of nodes || []) {
    if (!isRealNode(node) || node.parent_id == null) continue
    const key = String(node.parent_id)
    if (!childrenByParent.has(key)) childrenByParent.set(key, [])
    childrenByParent.get(key).push(node)
  }

  const centerY = rect.y + rect.height / 2
  const pad = Math.max(0, padding)
  let best = null

  for (const [parentId, children] of childrenByParent) {
    // 拖拽源自己作为父级时不允许落回自己身上，避免命中自己的子级列
    if (sourceId != null && parentId === String(sourceId)) continue

    const sorted = [...children].sort((a, b) => a.y - b.y)
    const top = sorted[0].y
    const bottom = sorted[sorted.length - 1].y + sorted[sorted.length - 1].height
    // 首/末子级外侧只在小段接近范围内把落点判给父级
    if (centerY < top - pad || centerY > bottom + pad) continue

    const columnLeft = Math.min(...sorted.map((child) => child.x))
    const columnRight = Math.max(...sorted.map((child) => child.x + nodeWidth))
    // 影子必须横向压在子级列上，避免把别层节点的空白误判给这个父级
    if (rect.x + rect.width <= columnLeft || rect.x >= columnRight) continue

    // 槽位序号 = 影子纵向中心越过了几个子级中心
    let index = 0
    for (const child of sorted) {
      if (centerY > child.y + child.height / 2) index += 1
    }

    // 首尾外的接近范围可能与相邻父级的子级列重叠，取中心更近的一个
    const distance = Math.abs(centerY - (top + bottom) / 2)
    if (best && distance >= best.distance) continue

    best = {
      parentId,
      index,
      distance,
      beforeId: sorted[index]?.id ?? null,
      afterId: index < sorted.length ? null : sorted[sorted.length - 1].id
    }
  }

  return best
    ? { parentId: best.parentId, index: best.index, beforeId: best.beforeId, afterId: best.afterId }
    : null
}

// 按锚点插入后的兄弟顺序与当前一致时说明是插回原位：从自己位置开始拖动不该出现预览，
// 松手也不必提交。siblings 为父级当前的直接子级顺序。
export const keepsOriginalOrder = (siblings, band, sourceId) => {
  if (!Array.isArray(siblings) || siblings.length === 0) return false
  const order = siblings.map(String)
  const id = String(sourceId)
  const anchorId = String(band.beforeId ?? band.afterId)
  // 锚点就是自己：插到自己前或后都等于没动
  if (anchorId === id) return true
  const rest = order.filter((sibling) => sibling !== id)
  const anchorIndex = rest.indexOf(anchorId)
  const at = anchorIndex === -1 ? rest.length : anchorIndex + (band.beforeId != null ? 0 : 1)
  rest.splice(at, 0, id)
  return rest.length === order.length && rest.every((value, index) => value === order[index])
}
