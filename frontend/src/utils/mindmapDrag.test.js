import { describe, expect, it } from 'vitest'
import { findChildGapTarget } from './mindmapDrag'

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

const shadow = (x, y, height = 40) => ({ x, y, width: nodeWidth, height })

describe('findChildGapTarget', () => {
  it('影子落在子级之间的空隙时命中父级，并插到后一个子级之前', () => {
    expect(findChildGapTarget({ nodes: layout, rect: shadow(300, 48), nodeWidth })).toEqual({
      parentId: '1',
      index: 1,
      beforeId: '1.2',
      afterId: null
    })
  })

  it('首子级上方接近范围内命中父级并插到首位', () => {
    expect(findChildGapTarget({ nodes: layout, rect: shadow(300, -30), nodeWidth, padding: 48 })).toEqual({
      parentId: '1',
      index: 0,
      beforeId: '1.1',
      afterId: null
    })
  })

  it('末子级下方接近范围内命中父级并追加到末尾', () => {
    expect(findChildGapTarget({ nodes: layout, rect: shadow(300, 130), nodeWidth, padding: 48 })).toEqual({
      parentId: '1',
      index: 2,
      beforeId: null,
      afterId: '1.2'
    })
  })

  it('首尾外侧超出接近范围时不命中', () => {
    expect(findChildGapTarget({ nodes: layout, rect: shadow(300, -80), nodeWidth, padding: 16 })).toBeNull()
    expect(findChildGapTarget({ nodes: layout, rect: shadow(300, 180), nodeWidth, padding: 16 })).toBeNull()
  })

  it('影子与子级列横向不重叠时不命中', () => {
    expect(findChildGapTarget({ nodes: layout, rect: shadow(0, 48), nodeWidth })).toBeNull()
  })

  it('以影子纵向中心判断槽位，跨越多个子级时插到对应序号', () => {
    const result = findChildGapTarget({ nodes: layout, rect: shadow(300, 20, 100), nodeWidth })
    expect(result.index).toBe(1)
    expect(result.beforeId).toBe('1.2')
  })

  it('忽略引用节点与占位节点', () => {
    const nodes = [
      ...layout,
      { ...node('ref:1:2', 300, 48, 40, 1), isRef: true },
      { ...node('placeholder', 300, 52, 40, 1), isPlaceholder: true }
    ]
    expect(findChildGapTarget({ nodes, rect: shadow(300, 48), nodeWidth }).beforeId).toBe('1.2')
  })

  it('拖拽源作为父级时不命中自己的子级列', () => {
    expect(findChildGapTarget({
      nodes: layout,
      rect: shadow(300, 48),
      nodeWidth,
      sourceId: '1'
    })).toBeNull()
  })

  it('相邻父级的接近范围重叠时取子级列中心更近的一个', () => {
    const nodes = [
      ...layout,
      node(2, 0, 300, 60),
      node('2.1', 300, 300, 40, 2)
    ]
    // 大范围接近阈值下两段子级列都进入候选，影子中心(140/280)分别靠近父级 1/2 的子级列中心(60/320)
    expect(findChildGapTarget({ nodes, rect: shadow(300, 120), nodeWidth, padding: 200 }).parentId).toBe('1')
    expect(findChildGapTarget({ nodes, rect: shadow(300, 260), nodeWidth, padding: 200 }).parentId).toBe('2')
  })
})
