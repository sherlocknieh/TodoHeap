import { describe, expect, it } from 'vitest'
import { buildTaskForest, collectCascadeIds, collectDescendantIds, findDeleteFocusId, withoutStaleTempChildIds } from './taskGraph'

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

  it('不传 sortFn 时兄弟顺序完全按 child_ids', () => {
    const forest = buildTaskForest([
      { id: 1, title: '父', child_ids: [3, 2] },
      { id: 2, title: 'A', child_ids: [] },
      { id: 3, title: 'Z', child_ids: [] }
    ], { mapItem })

    expect(forest[0].children.map(node => node.id)).toEqual([3, 2])
  })

  it('根任务作为唯一的森林根，顶层顺序就是它自己的 child_ids', () => {
    const forest = buildTaskForest([
      { id: 99, title: '全部任务', is_root: true, child_ids: [3, 1, 2] },
      { id: 1, title: '一', child_ids: [] },
      { id: 2, title: '二', child_ids: [] },
      { id: 3, title: '三', child_ids: [] }
    ], { mapItem })

    expect(forest).toHaveLength(1)
    expect(forest[0].id).toBe(99)
    expect(forest[0].children.map(node => node.id)).toEqual([3, 1, 2])
  })

  it('多父任务在每个父级下按各自的 child_ids 定位，引用行位置稳定', () => {
    const forest = buildTaskForest([
      { id: 1, title: 'A', child_ids: [9, 2] },
      { id: 3, title: 'B', child_ids: [4, 9] },
      { id: 2, title: 'A 独有', child_ids: [] },
      { id: 4, title: 'B 独有', child_ids: [] },
      { id: 9, title: '共享', child_ids: [] }
    ], { mapItem })

    expect(forest.map(node => node.id)).toEqual([1, 3])
    expect(forest[0].children.map(node => node.id)).toEqual([9, 2])
    // B 下的共享任务落到 child_ids 指定的位置（4 之后），而不是被排到末尾
    expect(forest[1].children.map(node => node.id)).toEqual([4, 'ref:3:9'])
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

describe('collectCascadeIds', () => {
  it('单父链完整级联', () => {
    const ids = collectCascadeIds([
      { id: 1, child_ids: [2] },
      { id: 2, child_ids: [3] },
      { id: 3, child_ids: [] }
    ], [1])

    expect(ids.sort()).toEqual([1, 2, 3])
  })

  it('共享子任务保留，且它下面的子树不级联', () => {
    const ids = collectCascadeIds([
      { id: 1, child_ids: [3] },
      { id: 2, child_ids: [3] },
      { id: 3, child_ids: [4] },
      { id: 4, child_ids: [] }
    ], [1])

    expect(ids).toEqual([1])
  })

  it('两个父级同时删除时共享子任务一起删除', () => {
    const ids = collectCascadeIds([
      { id: 1, child_ids: [3] },
      { id: 2, child_ids: [3] },
      { id: 3, child_ids: [4] },
      { id: 4, child_ids: [] }
    ], [1, 2])

    expect(ids.sort()).toEqual([1, 2, 3, 4])
  })

  it('环内节点不会重复扩张', () => {
    const ids = collectCascadeIds([
      { id: 1, child_ids: [2] },
      { id: 2, child_ids: [1] }
    ], [1])

    expect(ids.sort()).toEqual([1, 2])
  })

  it('永久删除时可把活动父级算作其它链接', () => {
    const active = [{ id: 2, child_ids: [3] }]
    const trash = [
      { id: 1, child_ids: [3] },
      { id: 3, child_ids: [] }
    ]

    const ids = collectCascadeIds(trash, [1], { parentItems: [...active, ...trash] })

    expect(ids).toEqual([1])
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

describe('findDeleteFocusId', () => {
  const siblings = [
    { id: 1, child_ids: [2, 3, 4] },
    { id: 2, child_ids: [] },
    { id: 3, child_ids: [] },
    { id: 4, child_ids: [] }
  ]

  it('优先下一个兄弟', () => {
    expect(findDeleteFocusId(siblings, 3)).toBe(4)
  })

  it('没有下一个时回到上一个兄弟', () => {
    expect(findDeleteFocusId(siblings, 4)).toBe(3)
  })

  it('没有兄弟时落到父任务', () => {
    const items = [
      { id: 1, child_ids: [2] },
      { id: 2, child_ids: [] }
    ]

    expect(findDeleteFocusId(items, 2)).toBe(1)
  })

  it('父级是根任务时返回 null', () => {
    const items = [
      { id: 99, is_root: true, child_ids: [1] },
      { id: 1, child_ids: [] }
    ]

    expect(findDeleteFocusId(items, 1)).toBeNull()
  })

  it('多父任务按指定展示父链取兄弟', () => {
    const items = [
      { id: 1, child_ids: [9, 2] },
      { id: 3, child_ids: [4, 9] },
      { id: 2, child_ids: [] },
      { id: 4, child_ids: [] },
      { id: 9, child_ids: [] }
    ]

    // 父级 3 下 9 没有下一个兄弟，回到上一个 4；没有 parentId 时按发现顺序取父级 1，下一个是 2
    expect(findDeleteFocusId(items, 9, { parentId: 3 })).toBe(4)
    expect(findDeleteFocusId(items, 9)).toBe(2)
  })

  it('跳过已不存在的兄弟 ID', () => {
    const items = [
      { id: 1, child_ids: [2, 999, 3] },
      { id: 2, child_ids: [] },
      { id: 3, child_ids: [] }
    ]

    expect(findDeleteFocusId(items, 2)).toBe(3)
  })
})

describe('withoutStaleTempChildIds', () => {
  it('剔除父级 child_ids 里残留的负数临时 ID, 保留有效顺序', () => {
    const cleaned = withoutStaleTempChildIds([
      { id: 1, child_ids: [-11, 4, -9, 7] },
      { id: 4, child_ids: [7] }
    ])

    expect(cleaned[0].child_ids).toEqual([4, 7])
    expect(cleaned[1]).toEqual({ id: 4, child_ids: [7] })
  })

  it('没有残留时保持原对象引用', () => {
    const items = [{ id: 1, child_ids: [4] }, { id: 4 }]

    expect(withoutStaleTempChildIds(items)[0]).toBe(items[0])
    expect(withoutStaleTempChildIds(items)[1]).toBe(items[1])
  })
})
