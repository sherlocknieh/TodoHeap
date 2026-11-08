import { describe, expect, it } from 'vitest'
import { buildTaskForest, collectDescendantIds } from './taskGraph'

const sortFn = (a, b) => a.id - b.id
const mapItem = (item) => ({ id: item.id, title: item.title })

describe('buildTaskForest', () => {
  it('按父节点的 child_ids 展开成树', () => {
    const forest = buildTaskForest([
      { id: 1, title: '父', child_ids: [2, 3] },
      { id: 2, title: '子一', child_ids: [] },
      { id: 3, title: '子二', child_ids: [] }
    ], { mapItem, sortFn })

    expect(forest).toHaveLength(1)
    expect(forest[0].id).toBe(1)
    expect(forest[0].children.map(node => node.id)).toEqual([2, 3])
    expect(forest[0].children[0].parent_id).toBe(1)
  })

  it('多父引用在第二次出现时收缩为回边节点', () => {
    const forest = buildTaskForest([
      { id: 1, title: '父一', child_ids: [3] },
      { id: 2, title: '父二', child_ids: [3] },
      { id: 3, title: '共享', child_ids: [] }
    ], { mapItem, sortFn })

    const allNodes = []
    const walk = (nodes) => nodes.forEach((node) => {
      allNodes.push(node)
      walk(node.children)
    })
    walk(forest)

    const realNodes = allNodes.filter(node => !node._isRef)
    const refNodes = allNodes.filter(node => node._isRef)

    expect(realNodes.map(node => node.id)).toEqual([1, 3, 2])
    expect(refNodes).toHaveLength(1)
    expect(refNodes[0]._refTargetId).toBe(3)
  })

  it('纯环没有自然根时提升环根并标记回边', () => {
    const forest = buildTaskForest([
      { id: 1, title: 'A', child_ids: [2] },
      { id: 2, title: 'B', child_ids: [1] }
    ], { mapItem, sortFn })

    expect(forest).toHaveLength(1)
    expect(forest[0].id).toBe(1)
    expect(forest[0]._cycleRoot).toBe(true)
    expect(forest[0].children[0].id).toBe(2)
    expect(forest[0].children[0].children[0]._isRef).toBe(true)
    expect(forest[0].children[0].children[0]._refTargetId).toBe(1)
  })

  it('自引用收缩为回边节点', () => {
    const forest = buildTaskForest([
      { id: 1, title: '自环', child_ids: [1] }
    ], { mapItem, sortFn })

    expect(forest).toHaveLength(1)
    expect(forest[0]._cycleRoot).toBe(true)
    expect(forest[0].children[0]._isRef).toBe(true)
  })
})

describe('collectDescendantIds', () => {
  it('在环中终止并返回可达后代', () => {
    const ids = collectDescendantIds([
      { id: 1, child_ids: [2] },
      { id: 2, child_ids: [1, 3] },
      { id: 3, child_ids: [] }
    ], 1)

    expect(ids.sort()).toEqual([2, 3])
  })
})
