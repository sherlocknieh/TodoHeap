import { describe, expect, it } from 'vitest'
import { ancestorLayersOf } from './taskChain'

// 根任务 1 → 10 → 11 → 30; 另一支 1 → 20 → 21 → 30
const multiParentItems = () => ([
  { id: 1, title: '全部任务', is_root: true, child_ids: [10, 20] },
  { id: 10, title: '项目', child_ids: [11] },
  { id: 11, title: '子项目', child_ids: [30] },
  { id: 20, title: '另一支', child_ids: [21] },
  { id: 21, title: '分支子', child_ids: [30] },
  { id: 30, title: '目标', child_ids: [] }
])

const titles = (group) => group.map((node) => node.title)
const layerTitles = (layers) => layers.map(titles)

describe('ancestorLayersOf', () => {
  it('多父任务按跳数分层, 同层去重且远层在前', () => {
    const { layers, truncated } = ancestorLayersOf(multiParentItems(), 30)

    expect(layerTitles(layers)).toEqual([
      ['项目', '另一支'],
      ['子项目', '分支子']
    ])
    expect(truncated).toBe(false)
  })

  it('菱形结构里共享祖先只保留一份', () => {
    const items = [
      { id: 1, title: '全部任务', is_root: true, child_ids: [10] },
      { id: 10, title: '共享祖先', child_ids: [11, 12] },
      { id: 11, title: '父一', child_ids: [30] },
      { id: 12, title: '父二', child_ids: [30] },
      { id: 30, title: '目标', child_ids: [] }
    ]

    const { layers } = ancestorLayersOf(items, 30)

    expect(layerTitles(layers)).toEqual([
      ['共享祖先'],
      ['父一', '父二']
    ])
  })

  it('环不会让分层无限展开', () => {
    const items = [
      { id: 1, title: '全部任务', is_root: true, child_ids: [10] },
      { id: 10, title: 'A', child_ids: [11] },
      { id: 11, title: 'B', child_ids: [10] }
    ]

    const { layers } = ancestorLayersOf(items, 11)

    expect(layerTitles(layers)).toEqual([['A']])
  })

  it('深度超过上限时截断并标记', () => {
    const items = [
      { id: 1, title: '全部任务', is_root: true, child_ids: [10] },
      { id: 10, title: 'A', child_ids: [11] },
      { id: 11, title: 'B', child_ids: [30] },
      { id: 30, title: '目标', child_ids: [] }
    ]

    const { layers, truncated } = ancestorLayersOf(items, 30, { maxDepth: 1 })

    expect(layerTitles(layers)).toEqual([['B']])
    expect(truncated).toBe(true)
  })

  it('唯一祖先超过上限时截断并标记', () => {
    const items = [
      { id: 1, title: '全部任务', is_root: true, child_ids: [] },
      { id: 10, title: '目标', child_ids: [] },
      { id: 11, title: '父一', child_ids: [10] },
      { id: 12, title: '父二', child_ids: [10] },
      { id: 13, title: '父三', child_ids: [10] }
    ]

    const { layers, truncated } = ancestorLayersOf(items, 10, { maxNodes: 1 })

    expect(layers.flat()).toHaveLength(1)
    expect(truncated).toBe(true)
  })

  it('顶层任务与未知任务没有祖先层', () => {
    expect(ancestorLayersOf(multiParentItems(), 10).layers).toEqual([])
    expect(ancestorLayersOf(multiParentItems(), 99).layers).toEqual([])
  })
})
