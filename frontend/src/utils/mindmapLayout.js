// 任务图排版：主方向按可见边分层；交叉方向有两种可切换模式——
// 紧凑布局：树排版 → 多父归中 → 空间回收；
// 标准布局：经典思维导图，子树按自身真实占地排布，父节点居中于子节点带。
// 机制与约束见 docs/src/content/docs/dev/logic/mindmap-layout.md
export const NODE_WIDTH = 216
export const MAIN_GAP = 84
export const CROSS_GAP = 24

// 多父节点的权重：层内投影时优先保住它的目标位置，普通节点让位。
// 同层邻居可能有很多个，权重必须远大于邻居数才能让平均位置真正生效
const MULTI_PARENT_WEIGHT = 200
// 收敛阈值与轮数上限：轮数只用于兜底，正常几轮内就会收敛
const SETTLE_EPSILON = 0.5
const SETTLE_ROUNDS = 24

const averageOf = (values) => (values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : null)

// 保序回归（PAVA）的通用投影：offsets 是相邻节点的最小中心距，
// weightOf 越大越能保住自己的目标位置；返回投影后的中心坐标数组
const projectMonotone = (positions, offsets, weightOf) => {
  const blocks = []
  positions.forEach((position, index) => {
    const weight = weightOf ? weightOf(index) : 1
    blocks.push({ sum: weight * (position - offsets[index]), weight, count: 1 })
    while (blocks.length > 1) {
      const last = blocks[blocks.length - 1]
      const prev = blocks[blocks.length - 2]
      if (prev.sum / prev.weight <= last.sum / last.weight) break
      prev.sum += last.sum
      prev.weight += last.weight
      prev.count += last.count
      blocks.pop()
    }
  })

  const result = new Array(positions.length)
  let cursor = 0
  blocks.forEach((block) => {
    const value = block.sum / block.weight
    for (let i = 0; i < block.count; i += 1) {
      result[cursor] = value + offsets[cursor]
      cursor += 1
    }
  })
  return result
}

const emptyResult = () => ({
  positions: new Map(),
  layers: new Map(),
  contentWidth: 0,
  contentHeight: 0,
  minX: 0,
  minY: 0,
  crossMax: 0
})

// 可见图 → 分层、层内顺序、树父级、父/子表。
// 两种布局共用这套骨架，差异只落在交叉方向的具体算法上
const buildGraphContext = ({ nodes, edges }) => {
  const byId = new Map(nodes.map((node) => [String(node.id), node]))
  const ids = [...byId.keys()]

  // 树父级只认非引用边；引用边是多父任务的额外父级
  const parentsOf = new Map(ids.map((id) => [id, []]))
  const childrenOf = new Map(ids.map((id) => [id, []]))
  const treeParentOf = new Map()
  edges.forEach((edge) => {
    const from = String(edge.from)
    const to = String(edge.to)
    if (from === to || !byId.has(from) || !byId.has(to)) return
    parentsOf.get(to).push(from)
    childrenOf.get(from).push(to)
    if (!edge.isRef && !treeParentOf.has(to)) treeParentOf.set(to, from)
  })
  // 纯环或只有引用边的节点没有树父级，退回第一条父级，保证每个节点都能进入树
  ids.forEach((id) => {
    if (!treeParentOf.has(id) && parentsOf.get(id).length > 0) {
      treeParentOf.set(id, parentsOf.get(id)[0])
    }
  })

  // Tarjan 求强连通分量：环内节点不能按边分层，需要先缩点
  let counter = 0
  const indices = new Map()
  const lowlinks = new Map()
  const stack = []
  const onStack = new Set()
  const components = []
  const componentOf = new Map()

  const connect = (id) => {
    indices.set(id, counter)
    lowlinks.set(id, counter)
    counter += 1
    stack.push(id)
    onStack.add(id)

    for (const next of childrenOf.get(id)) {
      if (!indices.has(next)) {
        connect(next)
        lowlinks.set(id, Math.min(lowlinks.get(id), lowlinks.get(next)))
      } else if (onStack.has(next)) {
        lowlinks.set(id, Math.min(lowlinks.get(id), indices.get(next)))
      }
    }

    if (lowlinks.get(id) === indices.get(id)) {
      const component = []
      let member
      do {
        member = stack.pop()
        onStack.delete(member)
        component.push(member)
        componentOf.set(member, components.length)
      } while (member !== id)
      components.push(component)
    }
  }
  ids.forEach((id) => {
    if (!indices.has(id)) connect(id)
  })

  // 分量缩点后做最长路径分层：多父任务落在所有父级之后，额外父级不会被挤成同层回边
  const componentEdges = Array.from({ length: components.length }, () => new Set())
  edges.forEach((edge) => {
    const from = componentOf.get(String(edge.from))
    const to = componentOf.get(String(edge.to))
    if (from === undefined || to === undefined || from === to) return
    componentEdges[from].add(to)
  })

  const indegree = new Array(components.length).fill(0)
  componentEdges.forEach((targets) => targets.forEach((to) => { indegree[to] += 1 }))

  const queue = []
  indegree.forEach((count, index) => { if (count === 0) queue.push(index) })

  const componentLayer = new Array(components.length).fill(0)
  while (queue.length > 0) {
    const current = queue.shift()
    componentEdges[current].forEach((next) => {
      componentLayer[next] = Math.max(componentLayer[next], componentLayer[current] + 1)
      indegree[next] -= 1
      if (indegree[next] === 0) queue.push(next)
    })
  }

  // 环内节点按 id 顺序各占一层，让环仍沿主方向可读
  const layerOf = new Map()
  components.forEach((component, index) => {
    const ordered = [...component].sort((a, b) => {
      const diff = Number(a) - Number(b)
      return Number.isFinite(diff) && diff !== 0 ? diff : String(a).localeCompare(String(b))
    })
    ordered.forEach((id, offset) => layerOf.set(id, componentLayer[index] + offset))
  })

  // 主方向：每层固定一个节点宽度，层间留 mainGap
  const layerKeys = [...new Set(ids.map((id) => layerOf.get(id) ?? 0))].sort((a, b) => a - b)
  const layerStart = new Map()
  layerKeys.forEach((layer, index) => {
    layerStart.set(layer, index * (NODE_WIDTH + MAIN_GAP))
  })
  const contentMain = Math.max(layerKeys.length * (NODE_WIDTH + MAIN_GAP) - MAIN_GAP, 0)

  // 层内顺序：沿可见边做深度优先，兄弟仍按数据顺序；顺序固定，避免展开/折叠后互相换位
  const order = new Map(layerKeys.map((layer) => [layer, []]))
  const dfsIndex = new Map()
  let dfsCursor = 0
  const walk = (id) => {
    if (dfsIndex.has(id)) return
    dfsIndex.set(id, dfsCursor)
    dfsCursor += 1
    childrenOf.get(id).forEach(walk)
  }
  const roots = ids.filter((id) => parentsOf.get(id).length === 0)
  ;(roots.length ? roots : ids).forEach(walk)
  ids.forEach(walk)
  ids.forEach((id) => {
    order.get(layerOf.get(id) ?? 0).push(byId.get(id))
  })
  order.forEach((list) => {
    list.sort((a, b) => (dfsIndex.get(String(a.id)) ?? 0) - (dfsIndex.get(String(b.id)) ?? 0))
  })

  // 树的子级：按层内顺序排列，子树块的跨度只由树边决定
  const treeChildren = new Map(ids.map((id) => [id, []]))
  treeParentOf.forEach((parent, child) => {
    if (treeChildren.has(parent)) treeChildren.get(parent).push(child)
  })
  treeChildren.forEach((list) => {
    list.sort((a, b) => (dfsIndex.get(a) ?? 0) - (dfsIndex.get(b) ?? 0))
  })

  const isMultiParent = new Set(ids.filter((id) => parentsOf.get(id).length > 1))

  return {
    byId,
    ids,
    parentsOf,
    childrenOf,
    treeParentOf,
    treeChildren,
    layerOf,
    layerKeys,
    layerStart,
    contentMain,
    order,
    isMultiParent
  }
}

// 交叉中心 → 画布坐标：根节点左上角钉在原点，主方向按 direction 翻转
const finalizePositions = ({ nodes, context, crossCenter, direction }) => {
  const { byId, layerOf, layerStart, contentMain } = context

  let minCross = Infinity
  let maxCross = -Infinity
  nodes.forEach((node) => {
    const center = crossCenter.get(String(node.id))
    minCross = Math.min(minCross, center - node.height / 2)
    maxCross = Math.max(maxCross, center + node.height / 2)
  })

  const anchorNode = nodes.find((node) => node.isRoot) ?? nodes[0]
  const anchorId = String(anchorNode.id)
  const crossOrigin = crossCenter.get(anchorId) - anchorNode.height / 2
  const anchorMain = layerStart.get(layerOf.get(anchorId) ?? 0)
  const mainOrigin = direction === 'left'
    ? contentMain - anchorMain - NODE_WIDTH
    : anchorMain

  const positions = new Map()
  nodes.forEach((node) => {
    const id = String(node.id)
    const mainOffset = layerStart.get(layerOf.get(id) ?? 0)
    const main = (direction === 'left' ? contentMain - mainOffset - NODE_WIDTH : mainOffset)
      - mainOrigin
    positions.set(id, {
      x: main,
      y: crossCenter.get(id) - node.height / 2 - crossOrigin
    })
  })

  return {
    positions,
    layers: layerOf,
    contentWidth: contentMain,
    contentHeight: maxCross - minCross,
    // 内容左上角在图坐标里的位置，供适应视图对齐
    minX: -mainOrigin,
    minY: minCross - crossOrigin,
    crossMax: maxCross
  }
}

// 紧凑布局：先按树把父子带居中排好，再把多父节点放到父级平均位置，
// 最后交替收敛、按真实节点边缘回收空出来的间隙
const computeGraphPositionsCompact = ({ nodes, edges, direction = 'right' }) => {
  if (!nodes || nodes.length === 0) return emptyResult()

  const context = buildGraphContext({ nodes, edges })
  const { byId, ids, layerKeys, order, treeChildren, parentsOf, isMultiParent } = context
  const crossCenter = new Map()
  const centerOf = (id) => crossCenter.get(id)

  // 第一步：树排版。子树块跨度 = 节点连同树后代在交叉方向占用的空间
  const blockSize = new Map()
  const blockSizeOf = (id) => {
    const cached = blockSize.get(id)
    if (cached !== undefined) return cached
    let span = 0
    treeChildren.get(id).forEach((child, index) => {
      span += blockSizeOf(child) + (index > 0 ? CROSS_GAP : 0)
    })
    const value = Math.max(byId.get(id).height, span)
    blockSize.set(id, value)
    return value
  }

  layerKeys.forEach((layer) => {
    let cursor = 0
    order.get(layer).forEach((node) => {
      const id = String(node.id)
      const half = blockSizeOf(id) / 2
      crossCenter.set(id, cursor + half)
      cursor += blockSizeOf(id) + CROSS_GAP
    })
  })

  const projectBlockLayer = (layer) => {
    const list = order.get(layer)
    if (list.length === 0) return
    const offsets = [0]
    for (let i = 1; i < list.length; i += 1) {
      offsets.push(offsets[i - 1]
        + (blockSizeOf(String(list[i - 1].id)) + blockSizeOf(String(list[i].id))) / 2
        + CROSS_GAP)
    }
    const projected = projectMonotone(list.map((node) => centerOf(String(node.id))), offsets)
    list.forEach((node, index) => crossCenter.set(String(node.id), projected[index]))
  }

  for (let round = 0; round < 4; round += 1) {
    for (let i = layerKeys.length - 1; i >= 0; i -= 1) {
      const layer = layerKeys[i]
      order.get(layer).forEach((node) => {
        const id = String(node.id)
        const kids = treeChildren.get(id)
        if (kids.length === 0) return
        crossCenter.set(id, averageOf(kids.map(centerOf)))
      })
      projectBlockLayer(layer)
    }
  }

  // 第二步：多父节点按所有父级的平均位置归中；
  // 层内用真实节点高度而不是子树块，留出的整块空间交给第三步回收
  const parentIdsOf = (id) => parentsOf.get(id) || []

  const projectBoxLayer = (layer) => {
    const list = order.get(layer)
    if (list.length === 0) return
    const offsets = [0]
    for (let i = 1; i < list.length; i += 1) {
      offsets.push(offsets[i - 1]
        + (list[i - 1].height + list[i].height) / 2
        + CROSS_GAP)
    }
    const projected = projectMonotone(
      list.map((node) => centerOf(String(node.id))),
      offsets,
      (index) => (isMultiParent.has(String(list[index].id)) ? MULTI_PARENT_WEIGHT : 1)
    )
    list.forEach((node, index) => crossCenter.set(String(node.id), projected[index]))
  }

  const applyMultiParentTargets = (layer) => {
    order.get(layer).forEach((node) => {
      const id = String(node.id)
      if (!isMultiParent.has(id)) return
      const target = averageOf(parentIdsOf(id).map(centerOf))
      if (target !== null) crossCenter.set(id, target)
    })
    projectBoxLayer(layer)
  }

  layerKeys.forEach(applyMultiParentTargets)

  // 第三步：交替收敛。父节点居中于树子节点带，子节点贴近父级（多父取平均），
  // 每轮按真实节点边缘投影，顺序不变、间距不小于 crossGap，空出来的间隙随之回收
  for (let round = 0; round < SETTLE_ROUNDS; round += 1) {
    let delta = 0
    const moveTo = (id, value) => {
      if (value === null) return
      delta = Math.max(delta, Math.abs(centerOf(id) - value))
      crossCenter.set(id, value)
    }

    for (let i = layerKeys.length - 1; i >= 0; i -= 1) {
      const layer = layerKeys[i]
      order.get(layer).forEach((node) => {
        const id = String(node.id)
        if (isMultiParent.has(id)) return
        const kids = treeChildren.get(id)
        if (kids.length > 0) moveTo(id, averageOf(kids.map(centerOf)))
      })
      projectBoxLayer(layer)
    }

    layerKeys.forEach((layer) => {
      order.get(layer).forEach((node) => {
        const id = String(node.id)
        if (node.isRoot) return
        moveTo(id, averageOf(parentIdsOf(id).map(centerOf)))
      })
      projectBoxLayer(layer)
    })

    // 多父节点在每轮末尾重新落位，普通节点为它们让出空间
    layerKeys.forEach(applyMultiParentTargets)

    if (delta < SETTLE_EPSILON) break
  }

  // 多父节点的平均位置是硬目标，最后再落位一次，避免收敛轮次在边界处提前停下
  layerKeys.forEach(applyMultiParentTargets)

  return finalizePositions({ nodes, context, crossCenter, direction })
}

// 标准布局：经典思维导图。子树按自身真实占地递归排布，父节点居中于子节点带；
// 多父节点取所有父级中心平均，只有产生重叠时才做层内最小分离
export const computeGraphPositionsStandard = ({ nodes, edges, direction = 'right' }) => {
  if (!nodes || nodes.length === 0) return emptyResult()

  const context = buildGraphContext({ nodes, edges })
  const { byId, ids, layerKeys, order, treeChildren, treeParentOf, parentsOf, isMultiParent } = context
  const crossCenter = new Map()
  const centerOf = (id) => crossCenter.get(id)

  // 子树块：块内坐标以 top=0 为基准，块高度是整棵子树的真实占地。
  // 子节点按顺序堆叠，父节点落在子节点中心的平均位置；父节点比子级带更高时整块向下扩
  const blockCache = new Map()
  const blockOf = (id) => {
    const cached = blockCache.get(id)
    if (cached) return cached
    const node = byId.get(id)
    const kids = treeChildren.get(id)
    const centers = new Map()
    if (kids.length === 0) {
      centers.set(id, node.height / 2)
    } else {
      let cursor = 0
      let sum = 0
      kids.forEach((kid, index) => {
        if (index > 0) cursor += CROSS_GAP
        const child = blockOf(kid)
        const shift = cursor - child.top
        child.centers.forEach((cy, mid) => centers.set(mid, cy + shift))
        sum += centers.get(kid)
        cursor += child.height
      })
      centers.set(id, sum / kids.length)
    }

    let top = Infinity
    let bottom = -Infinity
    centers.forEach((cy, mid) => {
      const half = byId.get(mid).height / 2
      top = Math.min(top, cy - half)
      bottom = Math.max(bottom, cy + half)
    })
    const shift = -top
    centers.forEach((cy, mid) => centers.set(mid, cy + shift))
    const block = { centers, top: 0, height: bottom - top }
    blockCache.set(id, block)
    return block
  }

  // 根块依次向下堆叠；正常只有一个根，合成根与孤儿根也按顺序排开
  const roots = ids.filter((id) => !treeParentOf.has(id))
  let cursor = 0
  ;(roots.length ? roots : [ids[0]]).forEach((rootId, index) => {
    if (index > 0) cursor += CROSS_GAP
    const block = blockOf(rootId)
    block.centers.forEach((cy, mid) => crossCenter.set(mid, cy + cursor))
    cursor += block.height
  })

  // 子树成员：多父归中、块压紧、块分离都按整块平移，块内相对位置不变
  const membersOf = (id, out = []) => {
    out.push(id)
    treeChildren.get(id).forEach((kid) => membersOf(kid, out))
    return out
  }

  // 子树在交叉方向的真实上下边缘
  const extentCache = new Map()
  const extentOf = (id) => {
    const cached = extentCache.get(id)
    if (cached) return cached
    let top = Infinity
    let bottom = -Infinity
    membersOf(id).forEach((mid) => {
      const node = byId.get(mid)
      const center = centerOf(mid)
      top = Math.min(top, center - node.height / 2)
      bottom = Math.max(bottom, center + node.height / 2)
    })
    const value = { top, bottom }
    extentCache.set(id, value)
    return value
  }

  const shiftBlock = (id, delta) => {
    if (!delta) return
    membersOf(id).forEach((mid) => crossCenter.set(mid, centerOf(mid) + delta))
    extentCache.clear()
  }

  // 多父节点整块移到所有父级的平均位置
  const applyMultiTargets = () => {
    layerKeys.forEach((layer) => {
      order.get(layer).forEach((node) => {
        const id = String(node.id)
        if (!isMultiParent.has(id)) return
        const target = averageOf(parentsOf.get(id).map(centerOf))
        if (target === null) return
        shiftBlock(id, target - centerOf(id))
      })
    })
  }

  // 多父节点被平移到父级平均位置后会离开原来的兄弟块，留下大段空隙。
  // 以多父节点为锚，把它前后连续的普通兄弟块按 24 间距重新贴紧
  const repackAroundPinned = (parentId) => {
    const kids = treeChildren.get(parentId)
    if (kids.length < 2) return
    const pinned = kids.map((kid) => isMultiParent.has(kid))
    if (!pinned.some(Boolean) || pinned.every(Boolean)) return

    const blocks = kids.map((kid) => ({ id: kid, ...extentOf(kid) }))
    let index = 0
    while (index < blocks.length) {
      if (pinned[index]) {
        index += 1
        continue
      }
      let end = index
      while (end + 1 < blocks.length && !pinned[end + 1]) end += 1

      const nextPinned = end + 1 < blocks.length ? blocks[end + 1] : null
      const prevPinned = index > 0 ? blocks[index - 1] : null
      if (nextPinned) {
        let bottom = nextPinned.top - CROSS_GAP
        for (let k = end; k >= index; k -= 1) {
          const block = blocks[k]
          const delta = bottom - block.bottom
          shiftBlock(block.id, delta)
          bottom = block.top + delta - CROSS_GAP
        }
      } else if (prevPinned) {
        let top = prevPinned.bottom + CROSS_GAP
        for (let k = index; k <= end; k += 1) {
          const block = blocks[k]
          const delta = top - block.top
          shiftBlock(block.id, delta)
          top = block.bottom + delta + CROSS_GAP
        }
      }
      index = end + 1
    }
  }

  // 兜底：压紧可能把某个块推进邻居。按子树块分离，块内相对位置保持不变
  // 层内最小分离：保留 DFS 顺序与 24 间距，多父节点权重更高。
  // 只处理节点真实边缘，不会为了块边界把不相干的分支撑开
  const separateLayer = (layer) => {
    const list = order.get(layer)
    if (list.length === 0) return
    const offsets = [0]
    for (let i = 1; i < list.length; i += 1) {
      offsets.push(offsets[i - 1]
        + (list[i - 1].height + list[i].height) / 2
        + CROSS_GAP)
    }
    const projected = projectMonotone(
      list.map((node) => centerOf(String(node.id))),
      offsets,
      (index) => (isMultiParent.has(String(list[index].id)) ? MULTI_PARENT_WEIGHT : 1)
    )
    list.forEach((node, index) => crossCenter.set(String(node.id), projected[index]))
  }

  // 先处理深层的父级：内层块压紧后高度会变，外层必须基于新的块边界重排
  const treeDepth = new Map()
  const depthOf = (id) => {
    const cached = treeDepth.get(id)
    if (cached !== undefined) return cached
    const parent = treeParentOf.get(id)
    const value = parent ? depthOf(parent) + 1 : 0
    treeDepth.set(id, value)
    return value
  }
  const repackOrder = [...ids].sort((a, b) => depthOf(b) - depthOf(a))

  // 多父归中与层内分离交替：归中会把块推进邻居，分离只补足重叠
  for (let round = 0; round < 3; round += 1) {
    applyMultiTargets()
    layerKeys.forEach(separateLayer)
  }

  // 以多父节点为锚，把普通兄弟块按 24 压紧（由深到浅，外层用新的块边界）
  repackOrder.forEach(repackAroundPinned)
  extentCache.clear()

  // 兜底：压紧可能让某个块压到别的分支，只按节点真实边缘补足重叠
  layerKeys.forEach(separateLayer)

  return finalizePositions({ nodes, context, crossCenter, direction })
}

// 布局模式：紧凑布局（三步定位）与标准布局（经典树布局）；未知值退回紧凑布局
export const computeGraphPositions = ({ nodes, edges, direction = 'right', mode = 'compact' }) => (
  mode === 'standard'
    ? computeGraphPositionsStandard({ nodes, edges, direction })
    : computeGraphPositionsCompact({ nodes, edges, direction })
)
