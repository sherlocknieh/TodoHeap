import { describe, expect, it } from 'vitest'
import { findRootTodo, isRootTodo, withoutRootTodos } from './rootTask'

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
})
