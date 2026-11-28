// 任务图拖拽命中：把父级可见子级列里的空白也算作父节点的落点。
// 供 MindMapWrapper 使用；输入是当前布局节点与指针/影子矩形。
// 拖节点时落点以被拖实节点的中心为参照，命中目标按竖直重叠度判定。
// 命中规则说明见 docs/src/content/docs/dev/logic/graph-drag-hit.md

const isRealNode = (node) => !node.isRef && !node.isPlaceholder

// 子级列空隙：调用方先排除「中心落在节点内」等情况，这里只处理指针落在
// 某个父级子级列范围内的空白，给出插入槽位（第 index 个可见子级之前）。
// 纵向范围是首子级上缘到末子级下缘，首/末外侧再放宽 padding，方便插到首/末位。
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

// 节点上/下半：落点归它所在父级的兄弟槽位（插到该节点前/后），
// 与子级空隙共用虚节点预览。
export const childEdgeBand = (node, position, parentId = null) => {
  const parent = parentId ?? node?.parent_id
  if (!node || node.isRoot || parent == null) return null
  if (position !== 'before' && position !== 'after') return null
  return {
    parentId: String(parent),
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

// 拖到节点上的命中：按影子中心落在节点水平范围的位置分成两类：
// - 拖进节点：中心在节点**出边侧** 1/3 带内（含该侧外侧）。子级出现在出边方向，
//   拖到那一侧就是「放进它下面」；不设竖直重叠阈值，纵向只要有交集就算。
// - 插到它前/后：中心在其余位置（中间 1/3 与入边侧 1/3），插到这个节点的兄弟序列。
//   入边侧留给兄弟命中，否则会和父级方向的落点互相抢。
// 两类各取竖直重叠最大者，重叠相同取纵向中心更近的；拖进优先于插序。
export const findVerticalDropTarget = ({
  nodes,
  rect,
  nodeWidth,
  sourceId = null,
  direction = 'right'
}) => {
  const centerX = rect.x + rect.width / 2
  let inside = null
  let insideRatio = 0
  let insideDistance = Infinity
  let edge = null
  let edgeRatio = 0
  let edgeDistance = Infinity

  for (const node of nodes || []) {
    if (node.isRef || node.isPlaceholder) continue
    if (sourceId != null && String(node.id) === String(sourceId)) continue

    const overlapY = Math.min(rect.y + rect.height, node.y + node.height) - Math.max(rect.y, node.y)
    if (overlapY <= 0) continue

    const overlapX = Math.min(rect.x + rect.width, node.x + nodeWidth) - Math.max(rect.x, node.x)
    const ratio = overlapY / Math.max(node.height, 1)
    const distance = Math.abs((rect.y + rect.height / 2) - (node.y + node.height / 2))

    // 拖进节点：中心落在出边侧 1/3 带内（含该侧外侧），不设竖直重叠阈值
    const third = nodeWidth / 3
    const inSideThird = direction === 'left'
      ? centerX <= node.x + third
      : centerX >= node.x + 2 * third
    if (overlapX > 0 && inSideThird) {
      if (ratio > insideRatio || (ratio === insideRatio && distance < insideDistance)) {
        inside = node
        insideRatio = ratio
        insideDistance = distance
      }
      continue
    }

    // 插到它前/后：中心在节点入边侧或中间 1/3.
    const centerInRange = centerX >= node.x && centerX <= node.x + nodeWidth
    if (!centerInRange) continue
    if (ratio > edgeRatio || (ratio === edgeRatio && distance < edgeDistance)) {
      edge = node
      edgeRatio = ratio
      edgeDistance = distance
    }
  }

  if (inside) return { node: inside, ratio: insideRatio, inside: true }
  if (edge) return { node: edge, ratio: edgeRatio, inside: false }
  return null
}
