import { describe, expect, it } from 'vitest'
import { parsePastedTasks } from './taskPaste'

describe('parsePastedTasks', () => {
  it('把 Markdown 列表按缩进还原成树', () => {
    expect(parsePastedTasks('- 父任务\n  - 子任务 1\n  - 子任务 2\n    - 孙任务\n- 第二个父任务')).toEqual([
      {
        title: '父任务',
        children: [
          { title: '子任务 1', children: [] },
          { title: '子任务 2', children: [{ title: '孙任务', children: [] }] }
        ]
      },
      { title: '第二个父任务', children: [] }
    ])
  })

  it('支持序号、星号与制表符缩进', () => {
    expect(parsePastedTasks('1. 第一步\n\t* 细节\n2) 第二步')).toEqual([
      { title: '第一步', children: [{ title: '细节', children: [] }] },
      { title: '第二步', children: [] }
    ])
  })

  it('纯文本当作单个节点，换行压成一行', () => {
    expect(parsePastedTasks('  买菜\n  顺便取快递  ')).toEqual([
      { title: '买菜 顺便取快递', children: [] }
    ])
  })

  it('丢弃空标题的项，把子级接到上一层', () => {
    expect(parsePastedTasks('- 父任务\n  -\n    - 孙任务')).toEqual([
      { title: '父任务', children: [{ title: '孙任务', children: [] }] }
    ])
  })

  it('空文本没有可建的任务', () => {
    expect(parsePastedTasks('')).toEqual([])
    expect(parsePastedTasks('   \n  ')).toEqual([])
    expect(parsePastedTasks(null)).toEqual([])
  })
})
