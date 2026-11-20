import { describe, expect, it } from 'vitest'
import { flattenTasksByDeadline, sortTodoTree } from './todoSort'

const makeTree = () => ([
  { id: 1, title: '无截止', deadline: null, created_at: '2026-01-01T00:00:00.000Z', duration: 3, children: [] },
  { id: 2, title: '晚截止', deadline: '2026-03-02T00:00:00.000Z', created_at: '2026-01-03T00:00:00.000Z', duration: 1, children: [] },
  { id: 3, title: '早截止', deadline: '2026-03-01T00:00:00.000Z', created_at: '2026-01-02T00:00:00.000Z', duration: 5, children: [] }
])

describe('sortTodoTree', () => {
  it('手动顺序保持原有排列', () => {
    const tree = makeTree()
    expect(sortTodoTree(tree, 'manual').map(node => node.id)).toEqual([1, 2, 3])
  })

  it('按截止时间升序，无截止时间排最后', () => {
    expect(sortTodoTree(makeTree(), 'deadline').map(node => node.id)).toEqual([3, 2, 1])
  })

  it('按截止时间降序，无截止时间仍排最后', () => {
    expect(sortTodoTree(makeTree(), 'deadline-desc').map(node => node.id)).toEqual([2, 3, 1])
  })

  it('多个无截止任务保持原有相对顺序', () => {
    const tree = [
      { id: 1, title: 'A', deadline: null, children: [] },
      { id: 2, title: 'B', deadline: '2026-03-01T00:00:00.000Z', children: [] },
      { id: 3, title: 'C', deadline: null, children: [] }
    ]
    expect(sortTodoTree(tree, 'deadline').map(node => node.id)).toEqual([2, 1, 3])
  })

  it('按创建时间倒序', () => {
    expect(sortTodoTree(makeTree(), 'created').map(node => node.id)).toEqual([2, 3, 1])
  })

  it('按耗时升序，无耗时排最后', () => {
    const tree = makeTree()
    tree[0].duration = null
    expect(sortTodoTree(tree, 'duration').map(node => node.id)).toEqual([2, 3, 1])
  })

  it('引用行固定排在末尾，子树递归排序', () => {
    const tree = [
      { id: 1, title: '父任务', deadline: null, children: [
        { id: 12, title: '子任务晚', deadline: '2026-05-02T00:00:00.000Z', children: [] },
        { id: 11, title: '子任务早', deadline: '2026-05-01T00:00:00.000Z', children: [] }
      ] },
      { id: 'ref:2:1', _isRef: true, title: '引用', deadline: '2026-01-01T00:00:00.000Z', children: [] }
    ]

    const sorted = sortTodoTree(tree, 'deadline')
    expect(sorted.map(node => node.id)).toEqual([1, 'ref:2:1'])
    expect(sorted[0].children.map(node => node.id)).toEqual([11, 12])
  })

  it('显示排序只产出副本，不改写原始树与 child_ids 顺序', () => {
    const tree = makeTree()
    tree[0].children = [{ id: 4, title: '子', deadline: '2026-03-05T00:00:00.000Z', children: [] }]

    sortTodoTree(tree, 'deadline')

    expect(tree.map(node => node.id)).toEqual([1, 2, 3])
    expect(tree[0].children.map(node => node.id)).toEqual([4])
  })
})

describe('flattenTasksByDeadline', () => {
  const tree = () => ([
    {
      id: 1, title: '父任务', deadline: null, children: [
        { id: 2, title: '子任务晚', deadline: '2026-03-02T00:00:00.000Z', children: [] },
        { id: 3, title: '子任务早', deadline: '2026-03-01T00:00:00.000Z', children: [] }
      ]
    },
    { id: 4, title: '单独任务', deadline: '2026-03-03T00:00:00.000Z', children: [] },
    { id: 'ref:1:2', _isRef: true, title: '引用', deadline: '2026-03-02T00:00:00.000Z', children: [] },
    { id: 5, title: '无截止', deadline: null, children: [] }
  ])

  it('收集带截止时间的任务成平铺列表，按截止时间升序且不带层级', () => {
    const flat = flattenTasksByDeadline(tree())

    expect(flat.map(node => node.id)).toEqual([3, 2, 4])
    expect(flat.every(node => node.children.length === 0)).toBe(true)
  })

  it('降序时整体反转，引用行与无截止任务不参与', () => {
    expect(flattenTasksByDeadline(tree(), { descending: true }).map(node => node.id)).toEqual([4, 2, 3])
  })
})
