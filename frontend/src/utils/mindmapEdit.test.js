import { describe, expect, it } from 'vitest'
import { resolveEditRequest } from './mindmapEdit'

const plan = (overrides) => resolveEditRequest({
  id: null,
  prevId: null,
  consumedId: null,
  editingPrev: false,
  replaced: false,
  ...overrides
})

describe('resolveEditRequest', () => {
  it('首次新建时打开编辑', () => {
    expect(plan({ id: 5 })).toEqual({ remap: false, consumedId: null, shouldStart: true })
  })

  it('同一 ID 重复触发时等布局补齐再打开一次', () => {
    expect(plan({ id: 5, prevId: 5, consumedId: null }).shouldStart).toBe(true)
    expect(plan({ id: 5, prevId: 5, consumedId: 5 }).shouldStart).toBe(false)
  })

  it('连续新建：上一次的 ID 变化不算换号，新任务仍要进入编辑', () => {
    expect(plan({ id: 6, prevId: 5, consumedId: 5 }).shouldStart).toBe(true)
    expect(plan({ id: 6, prevId: 5, consumedId: 5 }).consumedId).toBe(5)
  })

  it('临时 ID 换真实 ID 且编辑中：迁移消费标记但不重复打开', () => {
    expect(plan({ id: 9, prevId: -1, consumedId: -1, editingPrev: true, replaced: true }))
      .toEqual({ remap: true, consumedId: 9, shouldStart: false })
  })

  it('临时 ID 换真实 ID 但编辑已结束：只换号，不重开输入框', () => {
    expect(plan({ id: 9, prevId: -1, consumedId: -1, replaced: true }))
      .toEqual({ remap: false, consumedId: 9, shouldStart: false })
  })

  it('编辑中但换号关系未知时也迁移，避免内容随节点重建丢失', () => {
    expect(plan({ id: 9, prevId: -1, consumedId: -1, editingPrev: true }))
      .toEqual({ remap: true, consumedId: 9, shouldStart: false })
  })

  it('数字与字符串 ID 视为同一个任务', () => {
    expect(plan({ id: '9', prevId: 9, consumedId: 9 }).shouldStart).toBe(false)
  })
})
