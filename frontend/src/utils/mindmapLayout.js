// 任务图排版：主方向按可见边分层，交叉方向分三步定位——
// 先按树把父子带居中排好，再把多父节点放到父级平均位置，最后让其余节点回收空出来的间隙。
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

const computeGraphPositionsCompact = ({ nodes, edges, direction = 'right' }) => {
  if (!nodes || nodes.length === 0) {
    return {
      positions: new Map(),
      layers: new Map(),
      contentWidth: 0,
      contentHeight: 0,
      minX: 0,
      minY: 0,
      crossMax: 0
    }
  }

  const byId = new Map(nodes.map((node) => [String(node.id), node]))
  const ids = [...byId.keys()]

  // 收集父级、子级与树父级：树父级只认非引用边，引用边是多父任务的额外父级
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

  // 分量缩点后做最长路径分层，保证每条非环边都指向更深的层
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

  const crossCenter = new Map()
  const centerOf = (id) => crossCenter.get(id)

  // 子树块跨度：节点连同树后代在交叉方向占用的空间，用来把同层邻居推开
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

  // 第一步：树排版。初始按块跨度依次排开，再自深到浅把父节点居中于子节点带
  layerKeys.forEach((layer) => {
    let cursor = 0
    order.get(layer).forEach((node) => {
      const half = blockSizeOf(String(node.id)) / 2
      crossCenter.set(String(node.id), cursor + half)
      cursor += blockSizeOf(String(node.id)) + CROSS_GAP
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
  const isMultiParent = new Set(ids.filter((id) => parentIdsOf(id).length > 1))

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

  // 交叉方向的实际范围：包围盒与回边通道都以真实节点为准
  let minCross = Infinity
  let maxCross = -Infinity
  ids.forEach((id) => {
    const node = byId.get(id)
    const center = centerOf(id)
    minCross = Math.min(minCross, center - node.height / 2)
    maxCross = Math.max(maxCross, center + node.height / 2)
  })

  // 坐标原点钉在根节点左上角：展开/折叠只改变其它节点的相对位置，根节点在图上不动
  const anchorNode = nodes.find((node) => node.isRoot) ?? nodes[0]
  const anchorId = String(anchorNode.id)
  const crossOrigin = centerOf(anchorId) - anchorNode.height / 2
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
      y: centerOf(id) - node.height / 2 - crossOrigin
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

// 标准布局：保留原有算法，作为「紧凑布局」之外的可切换选项。
// 输入输出与紧凑布局一致，渲染层不需要感知具体算法
export const computeGraphPositionsStandard = ({ nodes, edges, direction = 'right' }) => {
  if (!nodes || nodes.length === 0) {
    return {
      positions: new Map(),
      layers: new Map(),
      contentWidth: 0,
      contentHeight: 0,
      minX: 0,
      minY: 0,
      crossMax: 0
    }
  }

  const nodeWidth = NODE_WIDTH
  const mainGap = MAIN_GAP
  const crossGap = CROSS_GAP
  const isForward = direction !== 'left'
  const rawEdges = edges
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const adjacency = new Map(nodes.map((node) => [node.id, []]))

  rawEdges.forEach((edge) => {
    if (byId.has(edge.from) && byId.has(edge.to)) adjacency.get(edge.from).push(edge.to)
  })

  // Tarjan 求强连通分量
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

    for (const next of adjacency.get(id)) {
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

  nodes.forEach((node) => {
    if (!indices.has(node.id)) connect(node.id)
  })

  // 分量缩点后做最长路径分层
  const componentEdges = Array.from({ length: components.length }, () => new Set())
  rawEdges.forEach((edge) => {
    const from = componentOf.get(edge.from)
    const to = componentOf.get(edge.to)
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

  // 环内节点按顺序占一层，让环方向仍然沿主方向可读
  const nodeLayer = new Map()
  components.forEach((component, index) => {
    const ordered = [...component].sort((a, b) => {
      const diff = Number(a) - Number(b)
      return Number.isFinite(diff) && diff !== 0 ? diff : String(a).localeCompare(String(b))
    })
    ordered.forEach((id, offset) => nodeLayer.set(id, componentLayer[index] + offset))
  })

  // 每层沿交叉方向排开，层与层沿主方向堆叠；节点等宽，层厚就是节点宽度
  const layerKeys = [...new Set(nodes.map((node) => nodeLayer.get(node.id) ?? 0))]
    .sort((a, b) => a - b)
  const layerMain = new Map()
  layerKeys.forEach((layer) => {
    layerMain.set(layer, nodeWidth)
  })

  let cursorMain = 0
  const layerStart = new Map()
  layerKeys.forEach((layer) => {
    layerStart.set(layer, cursorMain)
    cursorMain += layerMain.get(layer) + mainGap
  })
  const contentMain = Math.max(cursorMain - mainGap, 0)

  // 交叉方向：分层图布局。层内顺序按父节点位置（重心）排序，坐标由「贴近父节点 + 同层最小间距」求得
  const crossCenter = new Map()
  const crossSizeOf = (id) => byId.get(id).height

  // 只统计沿主方向向前的边；回边绕行展示，不参与交叉方向定位
  const parentsOf = new Map(nodes.map((node) => [node.id, []]))
  const childrenOf = new Map(nodes.map((node) => [node.id, []]))
  rawEdges.forEach((edge) => {
    if (edge.from === edge.to) return
    if (!parentsOf.has(edge.to) || !childrenOf.has(edge.from)) return
    const fromLayer = nodeLayer.get(edge.from) ?? 0
    const toLayer = nodeLayer.get(edge.to) ?? 0
    if (fromLayer >= toLayer) return
    parentsOf.get(edge.to).push(edge.from)
    childrenOf.get(edge.from).push(edge.to)
  })

  // 层内顺序：沿可见边（未折叠父节点的出边）做森林的深度优先序，兄弟仍按 child_ids 相邻，作为初始顺序。
  // 折叠父节点的出边已被剔除，共享子节点因此跟着仍然可见的父级排序，不会被折叠支的旧位置钉在层首。
  const order = new Map(layerKeys.map((layer) => [layer, []]))
  const dfsIndex = new Map()
  const visibleChildren = new Map(nodes.map((node) => [node.id, []]))
  rawEdges.forEach((edge) => {
    if (visibleChildren.has(edge.from)) visibleChildren.get(edge.from).push(edge.to)
  })
  let dfsCursor = 0
  const walkVisible = (id) => {
    if (dfsIndex.has(id)) return
    dfsIndex.set(id, dfsCursor)
    dfsCursor += 1
    ;(visibleChildren.get(id) || []).forEach(walkVisible)
  }
  // 根节点 = 没有入边的可见节点；折叠后的子节点已不在 edges 里
  const roots = nodes
    .filter((node) => !rawEdges.some((edge) => edge.to === node.id))
    .map((node) => String(node.id))
  roots.forEach(walkVisible)
  nodes.forEach((node) => {
    const layer = nodeLayer.get(node.id) ?? 0
    order.get(layer).push(node)
  })
  order.forEach((list) => list.sort((a, b) => (dfsIndex.get(a.id) ?? 0) - (dfsIndex.get(b.id) ?? 0)))

  // 子树块跨度：节点与相邻一列的子节点一起在交叉方向占用的空间。
  // 子节点只归第一个紧邻的父级，多父各占一份会把同列分支顶开；
  // 跨层链接的目标排在别的列，整棵子树不参与本列的留位
  const laneChildren = new Map(nodes.map((node) => [node.id, []]))
  const laneOwner = new Set()
  rawEdges.forEach((edge) => {
    const fromLayer = nodeLayer.get(edge.from)
    const toLayer = nodeLayer.get(edge.to)
    if (fromLayer === undefined || toLayer === undefined) return
    if (toLayer !== fromLayer + 1) return
    if (laneOwner.has(edge.to)) return
    laneOwner.add(edge.to)
    laneChildren.get(edge.from).push(edge.to)
  })

  const blockSize = new Map()
  const blockSizeOf = (id) => {
    const cached = blockSize.get(id)
    if (cached !== undefined) return cached
    let span = 0
    ;(laneChildren.get(id) || []).forEach((child, index) => {
      span += blockSizeOf(child) + (index > 0 ? crossGap : 0)
    })
    const value = Math.max(crossSizeOf(id), span)
    blockSize.set(id, value)
    return value
  }

  // 初始坐标：按层内顺序依次排开
  layerKeys.forEach((layer) => {
    let cursor = 0
    order.get(layer).forEach((node) => {
      const half = blockSizeOf(node.id) / 2
      crossCenter.set(node.id, cursor + half)
      cursor += blockSizeOf(node.id) + crossGap
    })
  })

  // 保序回归（PAVA）：把期望位置投影到「同层最小间距」约束上，得到该层的最优解
  const projectLayer = (layer) => {
    const list = order.get(layer)
    if (list.length === 0) return

    const offsets = [0]
    for (let i = 1; i < list.length; i += 1) {
      const gap = (blockSizeOf(list[i - 1].id) + blockSizeOf(list[i].id)) / 2 + crossGap
      offsets.push(offsets[i - 1] + gap)
    }

    // 相邻违例合并成块，块内取均值，保证结果单调不减
    const blocks = []
    list.forEach((node, index) => {
      blocks.push({ sum: crossCenter.get(node.id) - offsets[index], count: 1 })
      while (blocks.length > 1) {
        const last = blocks[blocks.length - 1]
        const prev = blocks[blocks.length - 2]
        if (prev.sum / prev.count <= last.sum / last.count) break
        prev.sum += last.sum
        prev.count += last.count
        blocks.pop()
      }
    })

    const desired = list.map((node) => crossCenter.get(node.id))
    let cursor = 0
    blocks.forEach((block) => {
      const value = block.sum / block.count
      for (let i = 0; i < block.count; i += 1) {
        crossCenter.set(list[cursor].id, value + offsets[cursor])
        cursor += 1
      }
    })

    // 投影会整体推移整层，按期望均值平移回来，避免逐层累积漂移
    const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length
    const drift = mean(desired) - mean(list.map((node) => crossCenter.get(node.id)))
    list.forEach((node) => crossCenter.set(node.id, crossCenter.get(node.id) + drift))
  }

  const averageOf = (ids) => {
    const values = ids.map((id) => crossCenter.get(id)).filter((value) => value !== undefined)
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
  }

  // 每个节点连同其紧邻列后代组成一个块，间距回收时整块平移，子树内部相对位置不变
  const blockNodes = new Map()
  const collectBlock = (id, seen) => {
    if (seen.has(id)) return []
    seen.add(id)
    const ids = [id]
    ;(laneChildren.get(id) || []).forEach((child) => {
      ids.push(...collectBlock(child, seen))
    })
    return ids
  }
  nodes.forEach((node) => blockNodes.set(node.id, collectBlock(node.id, new Set())))

  // 块在交叉方向的实际可见范围，用于按边缘而不是块中心计算空白
  const blockBoundsCache = new Map()
  const blockBoundsOf = (id) => {
    const cached = blockBoundsCache.get(id)
    if (cached) return cached
    let top = crossCenter.get(id) - crossSizeOf(id) / 2
    let bottom = crossCenter.get(id) + crossSizeOf(id) / 2
    ;(laneChildren.get(id) || []).forEach((child) => {
      const bounds = blockBoundsOf(child)
      if (bounds.top < top) top = bounds.top
      if (bounds.bottom > bottom) bottom = bounds.bottom
    })
    const value = { top, bottom }
    blockBoundsCache.set(id, value)
    return value
  }

  // 只压缩同一父级下兄弟分支之间的异常空白，正常展开空间保持不变
  const shareParent = (a, b) => {
    const parents = new Set(parentsOf.get(b) || [])
    return (parentsOf.get(a) || []).some((id) => parents.has(id))
  }

  const shiftBlock = (id, shift) => {
    ;(blockNodes.get(id) || [id]).forEach((member) => {
      crossCenter.set(member, crossCenter.get(member) + shift)
    })
  }

  // 逐层自下而上扫描同父兄弟：直接按当前可见边缘把空白压回 maxGap。
  // 每层独立处理，浅层的一次整体下移不会阻止深层继续回收（大空白常在被移动过的块内部）。
  const limitGaps = (layer) => {
    const list = order.get(layer)
    // 兄弟分支之间保留两个间隔，既有展开后的呼吸空间，又不会留下异常大的空白
    const maxGap = crossGap * 2
    for (let i = list.length - 1; i > 0; i -= 1) {
      const prev = list[i - 1]
      const cur = list[i]
      if (!shareParent(prev.id, cur.id)) continue
      blockBoundsCache.clear()
      const gap = blockBoundsOf(cur.id).top - blockBoundsOf(prev.id).bottom
      if (gap <= maxGap) continue
      const shift = gap - maxGap
      // 只下移当前对之前的块，保持顺序与块内相对位置；cur 及其下方不动
      for (let j = 0; j < i; j += 1) shiftBlock(list[j].id, shift)
      blockBoundsCache.clear()
    }
  }

  // 兜底：回收空白时整块下移可能压到别的父级分支（limitGaps 只看同父兄弟）。
  // 同层按节点真实上下边缘保证最小间距，重叠时把 cur 及之后的块整体下移。
  const separateLayer = (layer) => {
    const list = order.get(layer)
    for (let i = 1; i < list.length; i += 1) {
      const prev = list[i - 1]
      const cur = list[i]
      const gap = (crossCenter.get(cur.id) - crossSizeOf(cur.id) / 2)
        - (crossCenter.get(prev.id) + crossSizeOf(prev.id) / 2)
      if (gap >= crossGap) continue
      // 只下移 cur 及之后的块，保持层内顺序与块内相对位置
      const shift = crossGap - gap
      for (let j = i; j < list.length; j += 1) shiftBlock(list[j].id, shift)
      blockBoundsCache.clear()
    }
  }

  // 逐层定位：down 让子节点贴近父节点（多父节点取各父节点位置的平均值），
  // up 让父节点居中于子节点带。每层定位后投影回间距约束，避免重叠。
  const relaxLayer = (layer, mode) => {
    order.get(layer).forEach((node) => {
      const parents = averageOf(parentsOf.get(node.id))
      const children = averageOf(childrenOf.get(node.id))
      // up 时叶子没有子节点，保持当前位置，由父节点向它靠拢
      const target = mode === 'down' ? (parents ?? children) : children
      if (target !== null) crossCenter.set(node.id, target)
    })
    // 层内顺序固定为初始顺序，只让坐标收敛；每轮重排会让折叠/展开后顺序漂移
    projectLayer(layer)
  }

  // 交替收敛：父节点先居中于子节点带，子节点再贴近父节点，最后以子节点贴近父节点收尾
  for (let round = 0; round < 3; round += 1) {
    ;[...layerKeys].reverse().forEach((layer) => relaxLayer(layer, 'up'))
    layerKeys.forEach((layer) => relaxLayer(layer, 'down'))
    // 层间互不阻塞：每层都按当前坐标重新测量，浅层的下移不跳过深层内部的大空白
    layerKeys.forEach((layer) => {
      limitGaps(layer)
      separateLayer(layer)
    })
  }

  let minCross = Infinity
  let maxCross = -Infinity
  crossCenter.forEach((center, id) => {
    const half = crossSizeOf(id) / 2
    minCross = Math.min(minCross, center - half)
    maxCross = Math.max(maxCross, center + half)
  })

  // 坐标原点钉在根节点的左上角：展开/折叠只改变其它节点的相对位置，根节点在图上不动
  const anchorNode = nodes.find((node) => node.isRoot) ?? nodes[0]
  const crossOrigin = crossCenter.get(anchorNode.id) - crossSizeOf(anchorNode.id) / 2
  const anchorLayer = nodeLayer.get(anchorNode.id) ?? 0
  const anchorMain = layerStart.get(anchorLayer)
    + (layerMain.get(anchorLayer) - nodeWidth) / 2
  const mainOrigin = isForward
    ? anchorMain
    : contentMain - anchorMain - nodeWidth

  const positions = new Map()
  nodes.forEach((node) => {
    const id = String(node.id)
    const cross = crossCenter.get(id) - node.height / 2 - crossOrigin
    const layer = nodeLayer.get(id) ?? 0
    const mainOffset = layerStart.get(layer) + (layerMain.get(layer) - nodeWidth) / 2
    const main = (isForward ? mainOffset : contentMain - mainOffset - nodeWidth)
      - mainOrigin
    positions.set(id, { x: main, y: cross })
  })

  // 内容包围盒同样是相对根节点的偏移，可能为负值
  const crossMin = minCross - crossOrigin
  const contentCross = maxCross - minCross
  const mainMin = -mainOrigin

  return {
    positions,
    layers: nodeLayer,
    contentWidth: contentMain,
    contentHeight: contentCross,
    // 内容左上角在图坐标里的位置，供适应视图对齐
    minX: mainMin,
    minY: crossMin,
    crossMax: maxCross
  }
}

// 布局模式：紧凑布局（三步定位）与标准布局（原算法）；未知值退回紧凑布局
export const computeGraphPositions = ({ nodes, edges, direction = 'right', mode = 'compact' }) => (
  mode === 'standard'
    ? computeGraphPositionsStandard({ nodes, edges, direction })
    : computeGraphPositionsCompact({ nodes, edges, direction })
)
