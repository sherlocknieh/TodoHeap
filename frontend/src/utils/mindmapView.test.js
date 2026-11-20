import { describe, expect, it } from 'vitest'
import { REVEAL_MARGIN, revealView } from './mindmapView'

const base = {
  view: { x: 0, y: 0, scale: 1 },
  node: { x: 100, y: 100, width: 216, height: 40 },
  viewport: { width: 800, height: 600 }
}

describe('revealView', () => {
  it('节点完整可见时不改变视口', () => {
    expect(revealView(base)).toBeNull()
  })

  it('节点从右侧出界时按最小距离左移', () => {
    const result = revealView({ ...base, node: { ...base.node, x: 700 } })
    expect(result).toEqual({ x: 776 - 916, y: 0, scale: 1 })
    expect(result.scale).toBe(1)
  })

  it('节点从左上出界时移回留白内', () => {
    const result = revealView({ ...base, node: { ...base.node, x: -300, y: -50 } })
    expect(result).toEqual({ x: REVEAL_MARGIN + 300, y: REVEAL_MARGIN + 50, scale: 1 })
  })

  it('节点低于视口底部时上移', () => {
    const result = revealView({ ...base, node: { ...base.node, y: 580 } })
    expect(result).toEqual({ x: 0, y: 576 - 620, scale: 1 })
  })

  it('节点比可见区还大时缩小并居中，不放大', () => {
    const result = revealView({
      ...base,
      view: { x: 0, y: 0, scale: 3 },
      viewport: { width: 500, height: 400 }
    })
    const fit = (500 - REVEAL_MARGIN * 2) / 216
    expect(result.scale).toBeCloseTo(fit)
    expect(result.x + (100 + 108) * result.scale).toBeCloseTo(250)
    expect(result.y + (100 + 20) * result.scale).toBeCloseTo(200)
  })

  it('缩到下限仍装不下时停在下限，不继续缩小', () => {
    const result = revealView({
      ...base,
      view: { x: 0, y: 0, scale: 3 },
      node: { ...base.node, width: 4000, height: 40 },
      viewport: { width: 300, height: 300 },
      minScale: 0.15
    })
    expect(result.scale).toBe(0.15)
  })
})
