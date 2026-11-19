import { describe, expect, it } from 'vitest'
import { buildCoordinateGrid, niceGridStep } from './canvasGrid'

const viewport = { width: 600, height: 400, offsetX: 300, offsetY: 200, scale: 1 }

describe('niceGridStep', () => {
  it('取 1/2/5 的整十倍，保证屏幕间距不小于目标值', () => {
    expect(niceGridStep(100)).toBe(100)
    expect(niceGridStep(120)).toBe(200)
    expect(niceGridStep(40)).toBe(50)
    expect(niceGridStep(666)).toBe(1000)
  })

  it('缩放越大刻度越细', () => {
    expect(niceGridStep(100 / 2.5)).toBe(50)
    expect(niceGridStep(100 / 0.15)).toBe(1000)
  })
})

describe('buildCoordinateGrid', () => {
  it('原点居中时坐标轴落在视口中心', () => {
    const grid = buildCoordinateGrid(viewport)
    expect(grid.xAxis).toEqual({ y: 200 })
    expect(grid.yAxis).toEqual({ x: 300 })
  })

  it('主刻度每 100 一条，细线每 20 一条，且不重复画在原点', () => {
    const grid = buildCoordinateGrid(viewport)
    expect(grid.step).toBe(100)
    expect(grid.majorLines).toHaveLength(10) // x=±100、±200、±300 与 y=±100、±200
    expect(grid.minorLines.length).toBeGreaterThan(0)
    expect(grid.minorLines.some((line) => line.x1 === 300 || line.y1 === 200)).toBe(false)
  })

  it('标签跳过原点，范围与刻度一致', () => {
    const grid = buildCoordinateGrid(viewport)
    const texts = grid.labels.map((label) => label.text)
    expect(texts).not.toContain('0')
    expect(texts).toEqual(expect.arrayContaining(['-100', '100', '200']))
    expect(grid.labels).toHaveLength(10)
  })

  it('平移后标签贴着坐标轴，坐标轴移出视口时不再给标签', () => {
    const shifted = buildCoordinateGrid({ ...viewport, offsetX: 50, offsetY: 20 })
    expect(shifted.yAxis).toEqual({ x: 50 })
    expect(shifted.labels.every((label) => label.y !== 0)).toBe(true)

    const outside = buildCoordinateGrid({ ...viewport, offsetX: -50 })
    expect(outside.yAxis).toBeNull()
    expect(outside.labels.every((label) => label.anchor !== 'end')).toBe(true)
  })

  it('所有线条都落在视口内', () => {
    const grid = buildCoordinateGrid({ ...viewport, offsetX: 123.4, offsetY: -67.8, scale: 0.37 })
    const lines = [...grid.minorLines, ...grid.majorLines]
    expect(lines.every((line) => line.x1 >= -1e-6 && line.x1 <= viewport.width + 1e-6)).toBe(true)
    expect(lines.every((line) => line.y1 >= -1e-6 && line.y1 <= viewport.height + 1e-6)).toBe(true)
  })

  it('指定原点后坐标轴移到原点对应的屏幕位置', () => {
    const grid = buildCoordinateGrid({ ...viewport, originX: 100, originY: 50 })
    expect(grid.yAxis).toEqual({ x: 400 })
    expect(grid.xAxis).toEqual({ y: 250 })
    // 原点处不再有主刻度线，相邻主刻度仍按 100 取整
    expect(grid.majorLines.some((line) => line.x1 === 400 || line.y1 === 250)).toBe(false)
    expect(grid.labels.some((label) => label.text === '100' && label.x === 500)).toBe(true)
  })

  it('画布尚未测量时不产出任何几何', () => {
    expect(buildCoordinateGrid({ width: 0, height: 0 }).minorLines).toHaveLength(0)
  })
})
