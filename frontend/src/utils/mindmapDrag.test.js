import { describe, expect, it } from 'vitest'
import { childEdgeBand, findChildGapTarget, keepsOriginalOrder } from './mindmapDrag'

const nodeWidth = 216

const node = (id, x, y, height = 40, parentId = null) => ({
  id,
  x,
  y,
  height,
  parent_id: parentId
})

// 父级 1 在左列，子级 1.1/1.2 在右列，两块之间留 40px 空隙
const layout = [
  node(1, 0, 0, 60),
  node('1.1', 300, 0, 40, 1),
  node('1.2', 300, 80, 40, 1)
]

// 拖节点时判定输入的是一只指针点（宽度为 0）
const at = (x, y) => ({ x, y, width: 0, height: 0 })

describe('findChildGapTarget', () => {
  it('指针落在子级之间的空隙时命中父级，并插到后一个子级之前', () => {
    expect(findChildGapTarget({ nodes: layout, rect: at(300, 48), nodeWidth })).toEqual({
      parentId: '1',
      index: 1,
      beforeId: '1.2',
      afterId: null
    })
  })

  it('指针正好在首子级上缘时插到首位', () => {
    expect(findChildGapTarget({ nodes: layout, rect: at(300, 0), nodeWidth })).toEqual({
      parentId: '1',
      index: 0,
      beforeId: '1.1',
      afterId: null
    })
  })

  it('指针正好在末子级下缘时追加到末尾', () => {
    expect(findChildGapTarget({ nodes: layout, rect: at(300, 120), nodeWidth })).toEqual({
      parentId: '1',
      index: 2,
      beforeId: null,
      afterId: '1.2'
    })
  })

  it('指针在子级列上下方之外时不命中', () => {
    expect(findChildGapTarget({ nodes: layout, rect: at(300, -30), nodeWidth })).toBeNull()
    expect(findChildGapTarget({ nodes: layout, rect: at(300, 200), nodeWidth })).toBeNull()
  })

  it('指针与子级列横向不重叠时不命中', () => {
    expect(findChildGapTarget({ nodes: layout, rect: at(0, 48), nodeWidth })).toBeNull()
  })

  it('按指针纵向位置判断槽位', () => {
    const result = findChildGapTarget({ nodes: layout, rect: at(300, 60), nodeWidth })
    expect(result.index).toBe(1)
    expect(result.beforeId).toBe('1.2')
  })

  it('忽略引用节点与占位节点', () => {
    const nodes = [
      ...layout,
      { ...node('ref:1:2', 300, 48, 40, 1), isRef: true },
      { ...node('placeholder', 300, 52, 40, 1), isPlaceholder: true }
    ]
    expect(findChildGapTarget({ nodes, rect: at(300, 48), nodeWidth }).beforeId).toBe('1.2')
  })

  it('拖拽源作为父级时不命中自己的子级列', () => {
    expect(findChildGapTarget({
      nodes: layout,
      rect: at(300, 48),
      nodeWidth,
      sourceId: '1'
    })).toBeNull()
  })

  it('多个父级的子级列纵向重叠时取子级列中心更近的一个', () => {
    const nodes = [
      ...layout,
      node(2, 0, 300, 60),
      node('2.1', 300, 0, 40, 2)
    ]
    // 父级 1 的子级列中心 60，父级 2 的中心 20；指针 10 更靠近父级 2
    expect(findChildGapTarget({ nodes, rect: at(300, 10), nodeWidth }).parentId).toBe('2')
    expect(findChildGapTarget({ nodes, rect: at(300, 90), nodeWidth }).parentId).toBe('1')
  })
})

describe('keepsOriginalOrder', () => {
  const siblings = ['1', '2', '3', '4']

  it('插到自己前面且前面就是自己原位置时视为未移动', () => {
    expect(keepsOriginalOrder(siblings, { beforeId: '3', afterId: null }, '3')).toBe(true)
  })

  it('插到下一个兄弟之前时顺序未变', () => {
    expect(keepsOriginalOrder(siblings, { beforeId: '4', afterId: null }, '3')).toBe(true)
  })

  it('拖到前面时顺序改变', () => {
    expect(keepsOriginalOrder(siblings, { beforeId: '2', afterId: null }, '3')).toBe(false)
  })

  it('追加到末尾时顺序改变', () => {
    expect(keepsOriginalOrder(siblings, { beforeId: null, afterId: '4' }, '1')).toBe(false)
  })

  it('插到末子级之后（最后一个的位置）时顺序改变', () => {
    expect(keepsOriginalOrder(siblings, { beforeId: null, afterId: '4' }, '2')).toBe(false)
  })

  it('没有兄弟顺序信息时不拦截', () => {
    expect(keepsOriginalOrder(null, { beforeId: '3', afterId: null }, '3')).toBe(false)
  })
})

describe('childEdgeBand', () => {
  const child = { id: '2', parent_id: '1' }

  it('上四分之一归父级并插到该子级之前', () => {
    expect(childEdgeBand(child, 'before')).toEqual({
      parentId: '1',
      index: null,
      beforeId: '2',
      afterId: null
    })
  })

  it('下四分之一归父级并插到该子级之后', () => {
    expect(childEdgeBand(child, 'after')).toEqual({
      parentId: '1',
      index: null,
      beforeId: null,
      afterId: '2'
    })
  })

  it('中间区域不归父级，由调用方按拖进处理', () => {
    expect(childEdgeBand(child, 'inside')).toBeNull()
  })

  it('根节点不归父级', () => {
    expect(childEdgeBand({ id: '0', isRoot: true }, 'before')).toBeNull()
  })

  it('没有父级时不归父级', () => {
    expect(childEdgeBand({ id: '2', parent_id: null }, 'before')).toBeNull()
  })
})
