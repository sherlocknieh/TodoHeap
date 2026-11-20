import { describe, expect, it } from 'vitest'
import { pruneSelection, selectRange, toggleSelection } from './taskSelection'

describe('toggleSelection', () => {
  it('未选则加入，已选则移出', () => {
    const first = toggleSelection(new Set(), '1')
    expect([...first]).toEqual(['1'])
    expect([...toggleSelection(first, '1')]).toEqual([])
  })

  it('返回新集合，不改动原选择', () => {
    const original = new Set(['1'])
    toggleSelection(original, '2')
    expect([...original]).toEqual(['1'])
  })
})

describe('selectRange', () => {
  const keys = ['1', '2', '3', '4']

  it('正向连选包含两端', () => {
    expect([...selectRange(new Set(), keys, '2', '4')]).toEqual(['2', '3', '4'])
  })

  it('反向连选按可见顺序输出', () => {
    expect([...selectRange(new Set(), keys, '4', '2')]).toEqual(['2', '3', '4'])
  })

  it('锚点不可见时退化为切换目标', () => {
    expect([...selectRange(new Set(['1']), keys, '9', '3')]).toEqual(['1', '3'])
  })
})

describe('pruneSelection', () => {
  it('移除已不存在的键', () => {
    expect([...pruneSelection(new Set(['1', '2']), ['2', '3'])]).toEqual(['2'])
  })

  it('无变化时返回原集合', () => {
    const selection = new Set(['1'])
    expect(pruneSelection(selection, ['1'])).toBe(selection)
  })
})
