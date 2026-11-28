import { describe, expect, it } from 'vitest'
import { buildTaskForest } from './taskGraph'
import { allChainsOf, ancestorLayersOf, displayChainOf } from './taskChain'

const mapItem = (item) => ({ id: item.id, title: item.title, is_root: Boolean(item.is_root) })

const forestOf = (items) => buildTaskForest(items, { mapItem })

// 根任务 1 → 10 → 11 → 30; 另一支 1 → 20 → 21 → 30
const multiParentItems = () => ([
  { id: 1, title: '全部任务', is_root: true, child_ids: [10, 20] },
  { id: 10, title: '项目', child_ids: [11] },
  { id: 11, title: '子项目', child_ids: [30] },
  { id: 20, title: '另一支', child_ids: [21] },
  { id: 21, title: '分支子', child_ids: [30] },
  { id: 30, title: '目标', child_ids: [] }
])

const titles = (chain) => chain.map((node) => node.title)
const chainTitles = (chains) => chains.map((chain) => titles(chain.nodes))

describe('displayChainOf', () => {
  it('沿首现父级回溯, 根任务不算链首', () => {
    const items = multiParentItems()
    const chain = displayChainOf(forestOf(items), 30)

    expect(titles(chain)).toEqual(['项目', '子项目'])
  })

  it('顶层任务没有可展示的父链', () => {
    const items = multiParentItems()
    const chain = displayChainOf(forestOf(items), 10)

    expect(chain).toEqual([])
  })

  it('回收站任务不在树里时返回空链', () => {
    expect(displayChainOf(forestOf(multiParentItems()), 99)).toEqual([])
  })
})

describe('ancestorLayersOf', () => {
  it('多父任务按跳数分层, 同层去重且远层在前', () => {
    const { layers, truncated } = ancestorLayersOf(multiParentItems(), 30)

    expect(layers.map((group) => titles(group))).toEqual([
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

    expect(layers.map((group) => titles(group))).toEqual([
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

    expect(layers.map((group) => titles(group))).toEqual([['A']])
  })

  it('深度超过上限时截断并标记', () => {
    const items = [
      { id: 1, title: '全部任务', is_root: true, child_ids: [10] },
      { id: 10, title: 'A', child_ids: [11] },
      { id: 11, title: 'B', child_ids: [30] },
      { id: 30, title: '目标', child_ids: [] }
    ]

    const { layers, truncated } = ancestorLayersOf(items, 30, { maxDepth: 1 })

    expect(layers.map((group) => titles(group))).toEqual([['B']])
    expect(truncated).toBe(true)
  })

  it('顶层任务没有祖先层', () => {
    expect(ancestorLayersOf(multiParentItems(), 10).layers).toEqual([])
  })
})

describe('allChainsOf', () => {
  it('多父任务枚举出全部链路', () => {
    const { chains, truncated } = allChainsOf(multiParentItems(), 30)

    expect(chainTitles(chains)).toEqual([
      ['项目', '子项目'],
      ['另一支', '分支子']
    ])
    expect(chains.every((chain) => !chain.cycle)).toBe(true)
    expect(truncated).toBe(false)
  })

  it('祖先也多父时路径按分叉展开', () => {
    const items = multiParentItems().map((item) => (
      item.id === 11 ? { ...item, child_ids: [...item.child_ids] } : item
    ))
    items.push({ id: 12, title: '并行项目', child_ids: [11] })

    const { chains } = allChainsOf(items, 30)

    expect(chainTitles(chains)).toEqual([
      ['项目', '子项目'],
      ['并行项目', '子项目'],
      ['另一支', '分支子']
    ])
  })

  it('环只标记一次并停止回溯', () => {
    const items = [
      { id: 1, title: '全部任务', is_root: true, child_ids: [10] },
      { id: 10, title: 'A', child_ids: [11] },
      { id: 11, title: 'B', child_ids: [10] }
    ]

    const { chains } = allChainsOf(items, 11)

    expect(chainTitles(chains)).toEqual([['A']])
    expect(chains[0].cycle).toBe(true)
  })

  it('条数超过上限时截断并标记', () => {
    const items = [
      { id: 1, title: '全部任务', is_root: true, child_ids: [] },
      { id: 10, title: '目标', child_ids: [] },
      { id: 11, title: '父一', child_ids: [10] },
      { id: 12, title: '父二', child_ids: [10] },
      { id: 13, title: '父三', child_ids: [10] }
    ]

    const { chains, truncated } = allChainsOf(items, 10, { maxPaths: 2 })

    expect(chains).toHaveLength(2)
    expect(truncated).toBe(true)
  })
})
