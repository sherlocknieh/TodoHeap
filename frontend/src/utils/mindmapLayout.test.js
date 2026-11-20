import { describe, expect, it } from 'vitest'
import { CROSS_GAP, computeGraphPositions, computeGraphPositionsStandard } from './mindmapLayout'

const makeNode = (id, height = 38, extra = {}) => ({ id: String(id), height, isRoot: false, ...extra })
const treeEdge = (from, to) => ({ from: String(from), to: String(to), isRef: false })
const refEdge = (from, to) => ({ from: String(from), to: String(to), isRef: true })
const centerOf = (positions, nodes, id) => {
  const key = String(id)
  return positions.get(key).y + nodes.find((node) => node.id === key).height / 2
}

// 多父节点：树父级在浅层，额外父级在深层；最长路径把它放到更深的一层
const multiParentFixture = () => ({
  nodes: [
    makeNode('R', 52, { isRoot: true }),
    makeNode('A'),
    makeNode('B'),
    makeNode('C'),
    makeNode('D'),
    makeNode('E'),
    makeNode('T')
  ],
  edges: [
    treeEdge('R', 'A'),
    treeEdge('R', 'B'),
    treeEdge('A', 'C'),
    treeEdge('C', 'E'),
    treeEdge('B', 'D'),
    treeEdge('D', 'T'),
    refEdge('E', 'T')
  ]
})

describe('computeGraphPositions', () => {
  it('多父节点落在两个父级的平均位置', () => {
    const { nodes, edges } = multiParentFixture()
    const result = computeGraphPositions({ nodes, edges })
    const centerT = centerOf(result.positions, nodes, 'T')
    const midpoint = (centerOf(result.positions, nodes, 'D') + centerOf(result.positions, nodes, 'E')) / 2
    expect(Math.abs(centerT - midpoint)).toBeLessThan(0.5)
  })

  it('父节点居中于树子节点带', () => {
    const nodes = [
      makeNode('R', 52, { isRoot: true }),
      makeNode('P'),
      makeNode('C1'),
      makeNode('C2')
    ]
    const edges = [treeEdge('R', 'P'), treeEdge('P', 'C1'), treeEdge('P', 'C2')]
    const result = computeGraphPositions({ nodes, edges })
    const centerP = centerOf(result.positions, nodes, 'P')
    const midpoint = (centerOf(result.positions, nodes, 'C1') + centerOf(result.positions, nodes, 'C2')) / 2
    expect(Math.abs(centerP - midpoint)).toBeLessThan(0.5)
  })

  it('同层节点不重叠且结果稳定', () => {
    const nodes = [
      makeNode('R', 52, { isRoot: true }),
      makeNode('A'),
      makeNode('B'),
      makeNode('A1'),
      makeNode('A2'),
      makeNode('B1'),
      makeNode('B2'),
      makeNode('A1a')
    ]
    const edges = [
      treeEdge('R', 'A'),
      treeEdge('R', 'B'),
      treeEdge('A', 'A1'),
      treeEdge('A', 'A2'),
      treeEdge('B', 'B1'),
      treeEdge('B', 'B2'),
      treeEdge('A1', 'A1a')
    ]
    const first = computeGraphPositions({ nodes, edges })
    const second = computeGraphPositions({ nodes, edges })

    expect([...first.positions.entries()]).toEqual([...second.positions.entries()])

    const layers = new Map()
    first.layers.forEach((layer, id) => {
      if (!layers.has(layer)) layers.set(layer, [])
      layers.get(layer).push(nodes.find((node) => node.id === id))
    })
    layers.forEach((list) => {
      const sorted = [...list].sort((a, b) => first.positions.get(a.id).y - first.positions.get(b.id).y)
      for (let i = 1; i < sorted.length; i += 1) {
        const prev = first.positions.get(sorted[i - 1].id).y + sorted[i - 1].height
        const cur = first.positions.get(sorted[i].id).y
        expect(cur - prev).toBeGreaterThanOrEqual(CROSS_GAP - 0.5)
      }
    })
  })

  it('布局模式分发到对应算法，标准布局输出完整坐标', () => {
    const { nodes, edges } = multiParentFixture()
    const compact = computeGraphPositions({ nodes, edges })
    const standard = computeGraphPositions({ nodes, edges, mode: 'standard' })
    const standardDirect = computeGraphPositionsStandard({ nodes, edges })

    const balanced = computeGraphPositions({ nodes, edges, mode: 'balanced' })

    expect(compact.positions.size).toBe(nodes.length)
    expect(standard.positions.size).toBe(nodes.length)
    expect(balanced.positions.size).toBe(nodes.length)
    expect([...standard.positions.entries()]).toEqual([...standardDirect.positions.entries()])
    expect(standard.layers.get('T')).toBe(compact.layers.get('T'))
  })

  it('标准布局保持多父节点居中，兄弟块不重叠', () => {
    const nodes = [
      makeNode('R', 52, { isRoot: true }),
      makeNode('P1'),
      makeNode('P2'),
      makeNode('S'),
      makeNode('M')
    ]
    const edges = [
      treeEdge('R', 'P1'),
      treeEdge('R', 'P2'),
      treeEdge('P1', 'S'),
      treeEdge('P1', 'M'),
      refEdge('P2', 'M')
    ]
    const result = computeGraphPositions({ nodes, edges, mode: 'standard' })
    const height = (id) => nodes.find((node) => node.id === id).height
    const center = (id) => centerOf(result.positions, nodes, id)
    const top = (id) => result.positions.get(id).y
    const bottom = (id) => top(id) + height(id)

    // 多父节点 M 保持在父级平均位置，兄弟块之间不重叠
    expect(Math.abs(center('M') - (center('P1') + center('P2')) / 2)).toBeLessThan(0.5)
    expect(top('M') - bottom('S')).toBeGreaterThanOrEqual(CROSS_GAP - 0.5)
  })

  it('从右到左时主方向翻转，根节点仍在原点', () => {
    const nodes = [makeNode('R', 52, { isRoot: true }), makeNode('A')]
    const edges = [treeEdge('R', 'A')]
    const right = computeGraphPositions({ nodes, edges, direction: 'right' })
    const left = computeGraphPositions({ nodes, edges, direction: 'left' })

    expect(right.positions.get('R').x).toBe(0)
    expect(left.positions.get('R').x).toBe(0)
    expect(right.positions.get('A').x).toBeGreaterThan(0)
    expect(left.positions.get('A').x).toBeLessThan(0)
  })
})
