// 任务图坐标网格：按画布视口反推可见世界范围，屏幕上的刻度间距随缩放自适应
const NICE_STEPS = [1, 2, 5, 10]

const isInside = (value, max) => value >= 0 && value <= max

const formatValue = (value) => String(Math.round(value * 1e6) / 1e6)

// 主刻度取 1/2/5×10ⁿ，保证屏幕上相邻主刻度不小于 spacing 像素
export const niceGridStep = (worldPerSpacing) => {
  if (!(worldPerSpacing > 0)) return 0
  const power = 10 ** Math.floor(Math.log10(worldPerSpacing))
  const normalized = worldPerSpacing / power
  const factor = NICE_STEPS.find((candidate) => normalized <= candidate) ?? 10
  return factor * power
}

// 返回可直接绘制的屏幕坐标：细线、粗线、坐标轴刻度、轴标签；
// 坐标轴在视口外时只保留网格，不给没有落点的标签
export const buildCoordinateGrid = ({
  width,
  height,
  offsetX = 0,
  offsetY = 0,
  scale = 1,
  // 读作 0 的世界坐标点：网格与标签都相对它取整，轴也落在它上面
  originX = 0,
  originY = 0,
  spacing = 100,
  minorDivisions = 5
}) => {
  const safeScale = scale > 0 ? scale : 1
  // 把原点换算成屏幕基准点，后续视口范围、刻度与标签都按这个基准计算
  const baseX = offsetX + originX * safeScale
  const baseY = offsetY + originY * safeScale
  const step = niceGridStep(spacing / safeScale)
  const minorStep = step / minorDivisions
  const empty = { step: 0, minorLines: [], majorLines: [], ticks: [], labels: [], xAxis: null, yAxis: null }
  if (!(width > 0) || !(height > 0) || !(minorStep > 0)) return empty

  const left = -baseX / safeScale
  const right = (width - baseX) / safeScale
  const top = -baseY / safeScale
  const bottom = (height - baseY) / safeScale
  const toScreenX = (value) => value * safeScale + baseX
  const toScreenY = (value) => value * safeScale + baseY

  const minorLines = []
  const majorLines = []
  const ticks = []
  const labels = []

  // 以整数下标取线，避免浮点累加漂移；下标是 minorDivisions 的倍数时归入主刻度，
  // 原点留给坐标轴本身，不在主刻度里重复画一条
  for (let index = Math.ceil(left / minorStep - 1e-9); index <= Math.floor(right / minorStep + 1e-9); index += 1) {
    if (index % minorDivisions !== 0) {
      const x = toScreenX(index * minorStep)
      minorLines.push({ x1: x, y1: 0, x2: x, y2: height })
    } else if (index !== 0) {
      const x = toScreenX(index * minorStep)
      majorLines.push({ x1: x, y1: 0, x2: x, y2: height })
    }
  }
  for (let index = Math.ceil(top / minorStep - 1e-9); index <= Math.floor(bottom / minorStep + 1e-9); index += 1) {
    if (index % minorDivisions !== 0) {
      const y = toScreenY(index * minorStep)
      minorLines.push({ x1: 0, y1: y, x2: width, y2: y })
    } else if (index !== 0) {
      const y = toScreenY(index * minorStep)
      majorLines.push({ x1: 0, y1: y, x2: width, y2: y })
    }
  }

  // 坐标轴就是世界原点在屏幕上的位置；视口内才画轴与刻度
  const yAxis = isInside(baseX, width) ? { x: baseX } : null
  const xAxis = isInside(baseY, height) ? { y: baseY } : null

  if (xAxis) {
    const labelY = baseY >= 18 ? baseY - 6 : baseY + 12
    for (let index = Math.ceil(left / step - 1e-9); index <= Math.floor(right / step + 1e-9); index += 1) {
      if (index === 0) continue
      const value = index * step
      const x = Math.min(width - 12, Math.max(12, toScreenX(value)))
      labels.push({ x, y: labelY, text: formatValue(value), anchor: 'middle' })
      ticks.push({ x1: x, y1: baseY - 3, x2: x, y2: baseY + 3 })
    }
  }
  if (yAxis) {
    for (let index = Math.ceil(top / step - 1e-9); index <= Math.floor(bottom / step + 1e-9); index += 1) {
      if (index === 0) continue
      const value = index * step
      const y = toScreenY(value)
      labels.push({ x: Math.max(30, baseX - 6), y, text: formatValue(value), anchor: 'end' })
      ticks.push({ x1: baseX - 3, y1: y, x2: baseX + 3, y2: y })
    }
  }

  return { step, minorLines, majorLines, ticks, labels, xAxis, yAxis }
}
