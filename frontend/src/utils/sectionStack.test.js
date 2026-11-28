import { describe, expect, it } from 'vitest'
import { computeSectionHeights } from './sectionStack'

const base = {
  keys: ['details', 'description', 'children'],
  modes: { details: 'auto', description: 'fill', children: 'fixed' },
  headers: { details: 30, description: 30, children: 30 },
  contents: { details: 170 },
  total: 600,
  collapsed: {}
}

describe('computeSectionHeights', () => {
  it('auto 取内容高度、fixed 取 192px，fill 吃掉剩余空间', () => {
    expect(computeSectionHeights(base)).toEqual({
      details: 200,
      description: 208,
      children: 192
    })
  })

  it('折叠的分区只留标题行，fill 重新吃掉腾出的空间', () => {
    expect(computeSectionHeights({ ...base, collapsed: { children: true } })).toEqual({
      details: 200,
      description: 370,
      children: 30
    })
  })

  it('fill 自身折叠后不再撑满，其它分区按各自规则定高', () => {
    expect(computeSectionHeights({ ...base, collapsed: { description: true } })).toEqual({
      details: 200,
      description: 30,
      children: 192
    })
  })

  it('剩余空间不足时 fill 至少保留标题行', () => {
    const heights = computeSectionHeights({
      ...base,
      contents: { details: 500 }
    })
    expect(heights.description).toBe(30)
  })

  it('fixed 高度不会低于标题行', () => {
    const heights = computeSectionHeights({
      ...base,
      secondary: 20
    })
    expect(heights.children).toBe(30)
  })
})
