import { describe, expect, it } from 'vitest'
import { childTitlesOf, nextTaskTitle } from './taskTitle'

describe('nextTaskTitle', () => {
  it('参考标题末尾有数字时续号', () => {
    expect(nextTaskTitle('步骤 2')).toBe('步骤 3')
    expect(nextTaskTitle('步骤2')).toBe('步骤3')
  })

  it('保留前导零的位数', () => {
    expect(nextTaskTitle('步骤 02')).toBe('步骤 03')
    expect(nextTaskTitle('步骤 09')).toBe('步骤 10')
  })

  it('同级已占用下一个编号时继续往后跳', () => {
    expect(nextTaskTitle('步骤 2', ['步骤 2', '步骤 3'])).toBe('步骤 4')
  })

  it('没有末尾数字时用默认标题从 1 开始编号', () => {
    expect(nextTaskTitle('买菜')).toBe('新任务 1')
    expect(nextTaskTitle(null)).toBe('新任务 1')
  })

  it('默认标题跳过已占用的编号', () => {
    expect(nextTaskTitle(null, ['新任务 1', '新任务 3'])).toBe('新任务 2')
  })

  it('支持自定义默认标题', () => {
    expect(nextTaskTitle(null, ['(新任务) 1'], { baseTitle: '(新任务)' })).toBe('(新任务) 2')
  })
})

describe('childTitlesOf', () => {
  it('按父级 child_ids 返回同级标题并跳过不存在的 ID', () => {
    const items = [
      { id: 1, child_ids: [3, 999, 2] },
      { id: 2, title: '二' },
      { id: 3, title: '三' }
    ]

    expect(childTitlesOf(items, 1)).toEqual(['三', '二'])
    expect(childTitlesOf(items, null)).toEqual([])
  })
})
