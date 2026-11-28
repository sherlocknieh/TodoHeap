// 任务图拖拽命中：把父级可见子级列里的空白也算作父节点的落点。
// 供 MindMapWrapper 使用；输入是当前布局节点与指针点（宽度为 0 的矩形）。
// 拖节点时落点只由指针决定：指针在节点内由调用方先判掉，这里只处理指针落在
// 某个父级子级列范围内的空白，给出插入槽位（第 index 个可见子级之前）。
// 纵向范围是首子级上缘到末子级下缘，首/末外侧再放宽 padding，方便插到首/末位。
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
    // 首子级上缘到末子级下缘，首/末外侧再放宽一小段，方便插到首/末位
    if (centerY < top - pad || centerY > bottom + pad) continue

    const columnLeft = Math.min(...sorted.map((child) => child.x))
    const columnRight = Math.max(...sorted.map((child) => child.x + nodeWidth))
    // 指针必须横向压在子级列上（含边界），避免把别层节点的空白误判给这个父级
    if (rect.x + rect.width < columnLeft || rect.x > columnRight) continue

    // 槽位序号 = 指针纵向位置越过了几个子级中心
    let index = 0
    for (const child of sorted) {
      if (centerY > child.y + child.height / 2) index += 1
    }

    // 同层不同父级的子级列在纵向可能重叠，取子级列中心更近的一个
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

// 指针落在某个节点的上/下四分之一：落点归它所在父级的兄弟槽位（插到该节点前/后），
// 与子级空隙共用同一套虚节点预览。中间区域仍由调用方按「拖进该节点」处理。
export const childEdgeBand = (node, position) => {
  if (!node || node.isRoot || node.parent_id == null) return null
  if (position !== 'before' && position !== 'after') return null
  return {
    parentId: String(node.parent_id),
    index: null,
    beforeId: position === 'before' ? node.id : null,
    afterId: position === 'after' ? node.id : null
  }
}

// 叶子节点的出边区：指针落在它出边方向（子节点会出现的一侧）的一小段距离内时，
// 命中该节点本身，落点语义是「成为它的子级」。无子级的节点没有子级列，
// 靠这块区域才能把任务挂到它下面。距离按屏幕像素折算后传入 padding。
// 引用节点、占位节点、根节点、被拖节点自己与有子级的节点都不参与。
export const findLeafEdgeTarget = ({
  nodes,
  point,
  nodeWidth,
  direction = 'right',
  padding = 0,
  sourceId = null
}) => {
  const pad = Math.max(0, padding)
  let nearest = null
  let nearestDistance = Infinity

  for (const node of nodes || []) {
    if (node.isRef || node.isPlaceholder || node.isRoot) continue
    if (node.childCount > 0) continue
    if (sourceId != null && String(node.id) === String(sourceId)) continue

    // 纵向严格落在节点高度内，横向只看出边方向的那一段
    if (point.y < node.y || point.y > node.y + node.height) continue
    const near = direction === 'left' ? node.x - pad : node.x + nodeWidth
    const far = direction === 'left' ? node.x : node.x + nodeWidth + pad
    if (point.x < near || point.x > far) continue

    const distance = Math.hypot(
      point.x - (node.x + nodeWidth / 2),
      point.y - (node.y + node.height / 2)
    )
    if (distance >= nearestDistance) continue
    nearest = node
    nearestDistance = distance
  }

  return nearest
}
