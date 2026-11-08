import { describe, expect, it } from 'vitest'
import { sortTodoTree } from './todoSort'

const makeTree = () => ([
  { id: 1, title: '无截止', deadline: null, created_at: '2026-01-01T00:00:00.000Z', difficulty: 3, children: [] },
  { id: 2, title: '晚截止', deadline: '2026-03-02T00:00:00.000Z', created_at: '2026-01-03T00:00:00.000Z', difficulty: 1, children: [] },
  { id: 3, title: '早截止', deadline: '2026-03-01T00:00:00.000Z', created_at: '2026-01-02T00:00:00.000Z', difficulty: 5, children: [] }
])

describe('sortTodoTree', () => {
  it('手动顺序保持原有排列', () => {
    const tree = makeTree()
    expect(sortTodoTree(tree, 'manual').map(node => node.id)).toEqual([1, 2, 3])
  })

  it('按截止时间升序，无截止时间排最后', () => {
    expect(sortTodoTree(makeTree(), 'deadline').map(node => node.id)).toEqual([3, 2, 1])
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

  it('按难度升序，无难度排最后', () => {
    const tree = makeTree()
    tree[0].difficulty = null
    expect(sortTodoTree(tree, 'difficulty').map(node => node.id)).toEqual([2, 3, 1])
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
})
