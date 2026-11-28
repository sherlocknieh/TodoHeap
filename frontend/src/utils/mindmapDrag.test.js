import { describe, expect, it } from 'vitest'
import { childEdgeBand, findChildGapTarget, findLeafEdgeTarget, findVerticalDropTarget, keepsOriginalOrder } from './mindmapDrag'

const nodeWidth = 216

const node = (id, x, y, height = 40, parentId = null) => ({
  id,
  x,
  y,
  height,
  parent_id: parentId
})

// 父级 1 在左列，子级 1.1/1.2 在右列，两块之间留 40px 空隙
const layout = [
  node(1, 0, 0, 60),
  node('1.1', 300, 0, 40, 1),
  node('1.2', 300, 80, 40, 1)
]

// 拖节点时判定输入的是一只指针点（宽度为 0）
const at = (x, y) => ({ x, y, width: 0, height: 0 })

describe('findChildGapTarget', () => {
  it('指针落在子级之间的空隙时命中父级，并插到后一个子级之前', () => {
    expect(findChildGapTarget({ nodes: layout, rect: at(300, 48), nodeWidth })).toEqual({
      parentId: '1',
      index: 1,
      beforeId: '1.2',
      afterId: null
    })
  })

  it('指针正好在首子级上缘时插到首位', () => {
    expect(findChildGapTarget({ nodes: layout, rect: at(300, 0), nodeWidth })).toEqual({
      parentId: '1',
      index: 0,
      beforeId: '1.1',
      afterId: null
    })
  })

  it('指针正好在末子级下缘时追加到末尾', () => {
    expect(findChildGapTarget({ nodes: layout, rect: at(300, 120), nodeWidth })).toEqual({
      parentId: '1',
      index: 2,
      beforeId: null,
      afterId: '1.2'
    })
  })

  it('首/末子级外侧一小段内命中首/末位', () => {
    expect(findChildGapTarget({ nodes: layout, rect: at(300, -20), nodeWidth, padding: 24 })).toEqual({
      parentId: '1',
      index: 0,
      beforeId: '1.1',
      afterId: null
    })
    expect(findChildGapTarget({ nodes: layout, rect: at(300, 130), nodeWidth, padding: 24 })).toEqual({
      parentId: '1',
      index: 2,
      beforeId: null,
      afterId: '1.2'
    })
  })

  it('超出首/末子级外侧的接近范围时不命中', () => {
    expect(findChildGapTarget({ nodes: layout, rect: at(300, -30), nodeWidth, padding: 24 })).toBeNull()
    expect(findChildGapTarget({ nodes: layout, rect: at(300, 200), nodeWidth, padding: 24 })).toBeNull()
  })

  it('指针与子级列横向不重叠时不命中', () => {
    expect(findChildGapTarget({ nodes: layout, rect: at(0, 48), nodeWidth })).toBeNull()
  })

  it('按指针纵向位置判断槽位', () => {
    const result = findChildGapTarget({ nodes: layout, rect: at(300, 60), nodeWidth })
    expect(result.index).toBe(1)
    expect(result.beforeId).toBe('1.2')
  })

  it('忽略引用节点与占位节点', () => {
    const nodes = [
      ...layout,
      { ...node('ref:1:2', 300, 48, 40, 1), isRef: true },
      { ...node('placeholder', 300, 52, 40, 1), isPlaceholder: true }
    ]
    expect(findChildGapTarget({ nodes, rect: at(300, 48), nodeWidth }).beforeId).toBe('1.2')
  })

  it('拖拽源作为父级时不命中自己的子级列', () => {
    expect(findChildGapTarget({
      nodes: layout,
      rect: at(300, 48),
      nodeWidth,
      sourceId: '1'
    })).toBeNull()
  })

  it('多个父级的子级列纵向重叠时取子级列中心更近的一个', () => {
    const nodes = [
      ...layout,
      node(2, 0, 300, 60),
      node('2.1', 300, 0, 40, 2)
    ]
    // 父级 1 的子级列中心 60，父级 2 的中心 20；指针 10 更靠近父级 2
    expect(findChildGapTarget({ nodes, rect: at(300, 10), nodeWidth }).parentId).toBe('2')
    expect(findChildGapTarget({ nodes, rect: at(300, 90), nodeWidth }).parentId).toBe('1')
  })
})

describe('keepsOriginalOrder', () => {
  const siblings = ['1', '2', '3', '4']

  it('插到自己前面且前面就是自己原位置时视为未移动', () => {
    expect(keepsOriginalOrder(siblings, { beforeId: '3', afterId: null }, '3')).toBe(true)
  })

  it('插到下一个兄弟之前时顺序未变', () => {
    expect(keepsOriginalOrder(siblings, { beforeId: '4', afterId: null }, '3')).toBe(true)
  })

  it('拖到前面时顺序改变', () => {
    expect(keepsOriginalOrder(siblings, { beforeId: '2', afterId: null }, '3')).toBe(false)
  })

  it('追加到末尾时顺序改变', () => {
    expect(keepsOriginalOrder(siblings, { beforeId: null, afterId: '4' }, '1')).toBe(false)
  })

  it('插到末子级之后（最后一个的位置）时顺序改变', () => {
    expect(keepsOriginalOrder(siblings, { beforeId: null, afterId: '4' }, '2')).toBe(false)
  })

  it('没有兄弟顺序信息时不拦截', () => {
    expect(keepsOriginalOrder(null, { beforeId: '3', afterId: null }, '3')).toBe(false)
  })
})

describe('childEdgeBand', () => {
  const child = { id: '2', parent_id: '1' }

  it('上四分之一归父级并插到该子级之前', () => {
    expect(childEdgeBand(child, 'before')).toEqual({
      parentId: '1',
      index: null,
      beforeId: '2',
      afterId: null
    })
  })

  it('下四分之一归父级并插到该子级之后', () => {
    expect(childEdgeBand(child, 'after')).toEqual({
      parentId: '1',
      index: null,
      beforeId: null,
      afterId: '2'
    })
  })

  it('中间区域不归父级，由调用方按拖进处理', () => {
    expect(childEdgeBand(child, 'inside')).toBeNull()
  })

  it('根节点不归父级', () => {
    expect(childEdgeBand({ id: '0', isRoot: true }, 'before')).toBeNull()
  })

  it('没有父级时不归父级', () => {
    expect(childEdgeBand({ id: '2', parent_id: null }, 'before')).toBeNull()
  })
})

describe('findLeafEdgeTarget', () => {
  const leaf = { id: '9', x: 600, y: 100, height: 40, childCount: 0 }
  const parent = { id: '8', x: 600, y: 200, height: 40, childCount: 2 }
  const nodes = [leaf, parent]
  const at = (x, y) => ({ x, y })

  it('指针在叶子右侧一小段距离内时命中该叶子', () => {
    const hit = findLeafEdgeTarget({ nodes, point: at(600 + nodeWidth + 20, 120), nodeWidth, padding: 48 })
    expect(hit?.id).toBe('9')
  })

  it('指针超出距离时不命中', () => {
    expect(findLeafEdgeTarget({ nodes, point: at(600 + nodeWidth + 60, 120), nodeWidth, padding: 48 })).toBeNull()
  })

  it('指针纵向超出节点高度时不命中', () => {
    expect(findLeafEdgeTarget({ nodes, point: at(600 + nodeWidth + 20, 160), nodeWidth, padding: 48 })).toBeNull()
  })

  it('有子级的节点不出现在出边区判定里', () => {
    expect(findLeafEdgeTarget({ nodes, point: at(600 + nodeWidth + 20, 220), nodeWidth, padding: 48 })).toBeNull()
  })

  it('布局方向为左时看出边左侧', () => {
    const hit = findLeafEdgeTarget({
      nodes,
      point: at(600 - 20, 120),
      nodeWidth,
      direction: 'left',
      padding: 48
    })
    expect(hit?.id).toBe('9')
  })

  it('根节点不参与出边区命中', () => {
    expect(findLeafEdgeTarget({
      nodes: [{ ...leaf, isRoot: true }],
      point: at(600 + nodeWidth + 20, 120),
      nodeWidth,
      padding: 48
    })).toBeNull()
  })

  it('跳过被拖节点自己', () => {
    expect(findLeafEdgeTarget({
      nodes,
      point: at(600 + nodeWidth + 20, 120),
      nodeWidth,
      padding: 48,
      sourceId: '9'
    })).toBeNull()
  })

  it('跳过引用节点与占位节点', () => {
    const extra = [
      { ...leaf, id: 'ref', isRef: true },
      { ...leaf, id: 'ph', isPlaceholder: true }
    ]
    expect(findLeafEdgeTarget({
      nodes: extra,
      point: at(600 + nodeWidth + 20, 120),
      nodeWidth,
      padding: 48
    })).toBeNull()
  })
})

describe('findVerticalDropTarget', () => {
  const nodeWidth = 216
  // 两个同列兄弟：A [0,40]、B [64,104]
  const nodes = [
    { id: 'A', x: 0, y: 0, height: 40 },
    { id: 'B', x: 0, y: 64, height: 40 }
  ]
  const shadow = (y, height = 40, x = 0) => ({ x, y, width: nodeWidth, height })

  it('中心越过节点右缘且竖直重叠充足时算拖到它身上', () => {
    const hit = findVerticalDropTarget({ nodes, rect: shadow(0, 40, nodeWidth - 20), nodeWidth })
    expect(hit.node.id).toBe('A')
    expect(hit.inside).toBe(true)
  })

  it('中心越过右缘时不受竖直重叠比例限制：只擦到一点也算拖进', () => {
    const hit = findVerticalDropTarget({ nodes, rect: shadow(28, 40, nodeWidth - 20), nodeWidth })
    expect(hit.node.id).toBe('A')
    expect(hit.inside).toBe(true)
  })

  it('中心越过右缘但纵向完全不相交时不命中', () => {
    expect(findVerticalDropTarget({ nodes, rect: shadow(200, 40, nodeWidth - 20), nodeWidth })).toBeNull()
  })

  it('影子落在两节点之间的空隙时重叠不足阈值', () => {
    const hit = findVerticalDropTarget({ nodes, rect: shadow(32), nodeWidth })
    expect(hit.inside).toBe(false)
    expect(['A', 'B']).toContain(hit.node.id)
  })

  it('竖直重叠相同取纵向中心更近的节点', () => {
    const hit = findVerticalDropTarget({ nodes, rect: shadow(52), nodeWidth })
    expect(hit.node.id).toBe('B')
  })

  it('插到前后时中心在横向范围内即可参与', () => {
    const hit = findVerticalDropTarget({ nodes, rect: shadow(28), nodeWidth })
    expect(hit.node.id).toBe('A')
    expect(hit.inside).toBe(false)
  })

  it('中心落在入边侧 1/3 时不算拖进，走兄弟命中', () => {
    // 中心 x = 30，节点宽 216，左 1/3 边界 72；right 布局下左侧是入边方向
    const hit = findVerticalDropTarget({ nodes, rect: shadow(0, 40, -78), nodeWidth })
    expect(hit.node.id).toBe('A')
    expect(hit.inside).toBe(false)
  })

  it('中心落在出边侧 1/3 带内（仍在节点内）算拖进', () => {
    // 中心 x = 180，右 1/3 起点 144
    const hit = findVerticalDropTarget({ nodes, rect: shadow(0, 40, 72), nodeWidth })
    expect(hit.node.id).toBe('A')
    expect(hit.inside).toBe(true)
  })

  it('left 布局时出边侧 1/3 在左边', () => {
    const leftNodes = [{ id: 'L', x: 0, y: 0, height: 40 }]
    const onLeft = findVerticalDropTarget({
      nodes: leftNodes,
      rect: shadow(0, 40, -78),
      nodeWidth,
      direction: 'left'
    })
    expect(onLeft.inside).toBe(true)

    const onRight = findVerticalDropTarget({
      nodes: leftNodes,
      rect: shadow(0, 40, 72),
      nodeWidth,
      direction: 'left'
    })
    expect(onRight.inside).toBe(false)
  })

  it('中心落在中间 1/3 时算兄弟命中', () => {
    // 中心 x = 108，正好中间
    const hit = findVerticalDropTarget({ nodes, rect: shadow(0), nodeWidth })
    expect(hit.node.id).toBe('A')
    expect(hit.inside).toBe(false)
  })

  it('跳过被拖节点自己、引用节点与占位节点', () => {
    const extra = [
      { ...nodes[0], isRef: true },
      { ...nodes[0], id: 'ph', isPlaceholder: true }
    ]
    expect(findVerticalDropTarget({ nodes: extra, rect: shadow(0, 40, nodeWidth - 20), nodeWidth })).toBeNull()
    expect(findVerticalDropTarget({ nodes, rect: shadow(0, 40, nodeWidth - 20), nodeWidth, sourceId: 'A' })).toBeNull()
  })

  it('竖直重叠比例按节点高度计算', () => {
    const tall = [{ id: 'T', x: 0, y: 0, height: 100 }]
    // 影子只覆盖上半 40px：比例 0.4 < 0.5，且中心在节点内 → 插序
    const hit = findVerticalDropTarget({ nodes: tall, rect: { x: 0, y: 0, width: nodeWidth, height: 40 }, nodeWidth })
    expect(hit.ratio).toBeCloseTo(0.4, 5)
    expect(hit.inside).toBe(false)
  })
})
