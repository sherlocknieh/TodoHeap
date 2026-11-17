import { describe, expect, it } from 'vitest'
import { findRootTodo, isRootTodo, listTreeOf, withoutRootTodos } from './rootTask'

const legacyTask = { id: 1, title: '课程' }
const root = { id: 2, title: '全部任务', is_root: true }

describe('rootTask', () => {
  it('只把 is_root 为真的任务认作根任务', () => {
    expect(isRootTodo(root)).toBe(true)
    expect(isRootTodo(legacyTask)).toBe(false)
    expect(isRootTodo(null)).toBe(false)
  })

  it('findRootTodo 在混合列表里找出根任务', () => {
    expect(findRootTodo([legacyTask, root])).toBe(root)
    expect(findRootTodo([legacyTask])).toBeNull()
  })

  it('withoutRootTodos 保留普通任务与旧数据', () => {
    expect(withoutRootTodos([legacyTask, root])).toEqual([legacyTask])
    expect(withoutRootTodos(null)).toEqual([])
  })

  it('listTreeOf 只展开根任务的子级', () => {
    const rootWithChildren = { ...root, children: [legacyTask] }
    expect(listTreeOf([rootWithChildren])).toEqual([legacyTask])
  })

  it('listTreeOf 把失去父链接的任务按顶层展示', () => {
    const rootWithChildren = { ...root, children: [legacyTask] }
    const orphan = { id: 3, title: '解链任务' }
    expect(listTreeOf([rootWithChildren, orphan])).toEqual([legacyTask, orphan])
  })

  it('listTreeOf 在没有根任务时沿用森林', () => {
    expect(listTreeOf([legacyTask])).toEqual([legacyTask])
    expect(listTreeOf(null)).toEqual([])
  })
})
