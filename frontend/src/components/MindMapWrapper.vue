<template>
  <!-- 自研思维导图：SVG 渲染，支持滚轮缩放、拖拽平移与键盘增删改 -->
  <div ref="container" tabindex="0"
    class="mindmap-canvas relative w-full h-full overflow-hidden outline-none select-none"
    :class="panning || dragState.active ? 'cursor-grabbing' : 'cursor-grab'"
    @wheel.prevent="onWheel" @pointerdown="onPointerDown" @pointermove="onPointerMove"
    @pointerup="endPan" @pointerleave="endPan" @click.stop="onCanvasClick" @dblclick="fitView"
    @keydown="onKeydown">
    <svg class="block w-full h-full touch-none" :viewBox="`0 0 ${size.width} ${size.height}`">
      <defs>
        <!-- 箭头继承连线颜色；userSpaceOnUse 让箭头尺寸不随线宽变化 -->
        <marker id="mm-arrow" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8"
          markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M1 2.6 L9 5 L1 7.4z" fill="context-stroke" />
        </marker>
        <marker id="mm-arrow-ref" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8"
          markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M1 2.6 L9 5 L1 7.4z" fill="context-stroke" />
        </marker>
      </defs>

      <g :transform="`translate(${view.x} ${view.y}) scale(${view.scale})`">
        <!-- 未选中的连线铺在节点下层，节点框可以压住线头 -->
        <path v-for="edge in baseEdges" :key="edge.key" :d="edge.d" fill="none" stroke-linecap="round"
          class="stroke-neutral-300 dark:stroke-neutral-600" stroke-width="1.2"
          marker-end="url(#mm-arrow)" />

        <!-- 连线热区：透明加宽描边，便于点中细线 -->
        <path v-for="edge in layout.edges" :key="`hit-${edge.key}`" :d="edge.d" fill="none"
          stroke="transparent" stroke-width="14" stroke-linecap="round"
          :class="edge.deletable ? 'cursor-pointer' : 'cursor-default'"
          @pointerdown.stop @click.stop="selectEdge(edge)" />

        <!-- 拖拽建链接：从指针指向被拖动节点的预览线，箭头落在节点上 -->
        <path v-if="dragState.active && dragState.preview" :d="dragState.preview" fill="none"
          class="stroke-accent-500 dark:stroke-accent-400" stroke-width="1.6" stroke-dasharray="6 4"
          stroke-linecap="round" marker-end="url(#mm-arrow-ref)" />

        <!-- 节点 -->
        <g v-for="node in layout.nodes" :key="node.id" :transform="`translate(${node.x} ${node.y})`"
          :opacity="node.completed_at ? 0.55 : 1"
          :class="node.isRoot ? 'cursor-default' : 'cursor-pointer'"
          @pointerdown.stop="onNodePointerDown($event, node)" @dblclick.stop="startEdit(node)"
          @click.stop="selectNode(node)">
          <rect :width="nodeWidth" :height="node.height" rx="8" :stroke-width="node.selected ? 2 : 1"
            :fill-opacity="node.isRoot ? 0.9 : 0.72"
            class="transition-colors" :class="[
              dragState.targetId === node.id
                ? 'stroke-accent-600 dark:stroke-accent-400'
                : node.selected
                  ? 'stroke-accent-600 dark:stroke-accent-400'
                  : 'stroke-neutral-200 dark:stroke-neutral-700',
              node.isRoot
                ? 'fill-accent-700 dark:fill-accent-500'
                : dragState.targetId === node.id
                  ? 'fill-accent-100 dark:fill-accent-500/25'
                  : node.selected
                    ? 'fill-accent-50 dark:fill-neutral-800'
                    : 'fill-white dark:fill-neutral-900'
            ]" />
          <text :x="10" :y="0" class="text-[13px] font-medium" :class="node.isRoot
            ? 'fill-white'
            : 'fill-neutral-800 dark:fill-neutral-100'">
            <tspan v-for="(line, index) in node.lines" :key="index" :x="10"
              :dy="index === 0 ? paddingTop + fontSize : lineHeight">{{ line }}</tspan>
          </text>
        </g>

        <!-- 选中连线：压在节点之上高亮，配合中点删除按钮 -->
        <path v-if="selectedEdge" :d="selectedEdge.d" fill="none" stroke-linecap="round"
          class="pointer-events-none stroke-accent-600 dark:stroke-accent-400" stroke-width="2.4"
          marker-end="url(#mm-arrow)" />

        <!-- 选中连线：在连线中点显示删除按钮，置于节点之上以免被遮挡 -->
        <g v-if="selectedEdge && selectedEdge.midpoint"
          :transform="`translate(${selectedEdge.midpoint.x} ${selectedEdge.midpoint.y})`"
          @pointerdown.stop @click.stop="deleteSelectedEdge">
          <circle r="12" class="cursor-pointer fill-transparent stroke-transparent" />
          <circle r="7" class="cursor-pointer fill-white stroke-accent-600 hover:fill-accent-50 dark:fill-neutral-900 dark:stroke-accent-400 dark:hover:fill-neutral-800" stroke-width="1.1">
            <title>删除连接线</title>
          </circle>
          <path d="M-2.2 -2.2 L2.2 2.2 M2.2 -2.2 L-2.2 2.2" fill="none"
            class="pointer-events-none stroke-accent-600 dark:stroke-accent-400" stroke-width="1.4"
            stroke-linecap="round" />
        </g>
      </g>
    </svg>

    <!-- 内联重命名：输入框浮在节点上方，回车保存、Esc 取消 -->
    <input v-if="editingNode" ref="editInput" v-model="editingText"
      class="absolute z-20 rounded-md border border-accent-500 bg-white px-2 font-medium text-neutral-900 shadow-sm outline-none select-text dark:bg-neutral-900 dark:text-neutral-100"
      :style="editStyle" @keydown.stop="onEditKeydown" @blur="commitEdit" />

    <!-- 视图控件：布局方向循环切换与适应视图 -->
    <div class="absolute bottom-3 right-3 z-10 flex items-center gap-1" @pointerdown.stop>
      <button
        class="bg-white dark:bg-neutral-900 border border-hairline dark:border-hairline-dark rounded p-1.5 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
        :title="`布局方向：${currentDirection.label}（点击切换）`" @click.stop="cycleDirection">
        <AppIcon :name="currentDirection.icon" :size="14" />
      </button>
      <button
        class="bg-white dark:bg-neutral-900 border border-hairline dark:border-hairline-dark rounded p-1.5 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
        title="适应视图" @click.stop="fitView">
        <AppIcon name="target" :size="14" />
      </button>
    </div>
    <p class="absolute bottom-3 left-3 z-10 text-[11px] text-neutral-400 dark:text-neutral-600 pointer-events-none">
      滚轮缩放 · 拖拽平移 · 拖节点到另一节点建立链接 · 点选连线可删除 · Enter 同级 · Tab 子级 · F2 重命名
    </p>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { persistedRef, readUiState, writeUiState } from '@/utils/uiState'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  selectedTaskId: { type: Number, default: null },
  // 新建任务后由父级指定要立即重命名的节点
  editTaskId: { type: Number, default: null }
})

const emit = defineEmits(['task-selected', 'create-task', 'rename-task', 'delete-task', 'toggle-done', 'link-task', 'unlink-task'])

const nodeWidth = 200
const fontSize = 13
const lineHeight = 16
const paddingTop = 10
const maxLines = 3
const crossGap = 24
const mainGap = 84
const textUnitsPerLine = 13

const container = ref(null)
const size = reactive({ width: 0, height: 0 })
const view = reactive({ x: 0, y: 0, scale: 1 })
const panning = ref(false)

const directionOptions = [
  { value: 'down', icon: 'chevronDown', label: '从上到下' },
  { value: 'right', icon: 'chevronRight', label: '从左到右' },
  { value: 'up', icon: 'chevronUp', label: '从下到上' },
  { value: 'left', icon: 'chevronLeft', label: '从右到左' }
]

// 布局方向属于阅读偏好，刷新后沿用上次选择
const direction = persistedRef('mindmap-direction', 'right', {
  validate: (value) => directionOptions.some((option) => option.value === value)
})

const currentDirection = computed(() =>
  directionOptions.find((option) => option.value === direction.value) ?? directionOptions[1])

// 单个按钮按固定顺序轮换四个方向
const cycleDirection = () => {
  const index = directionOptions.findIndex((option) => option.value === direction.value)
  direction.value = directionOptions[(index + 1) % directionOptions.length].value
}

const isVertical = computed(() => direction.value === 'down' || direction.value === 'up')
const isForward = computed(() => direction.value === 'down' || direction.value === 'right')

// 主方向是层级展开方向，交叉方向是同层节点的排列方向
const nodeMainSize = (node) => (isVertical.value ? node.height : nodeWidth)
const nodeCrossSize = (node) => (isVertical.value ? nodeWidth : node.height)

// 中文按整字宽度、西文按半角宽度估算换行，保证节点内文字不溢出
const wrapLines = (text) => {
  const chars = [...String(text || '未命名任务')]
  const lines = []
  let line = ''
  let units = 0

  for (const char of chars) {
    const charUnits = /[\u2e80-\u9fff\uff00-\uffef]/.test(char) ? 1 : 0.55
    if (units + charUnits > textUnitsPerLine && line) {
      lines.push(line)
      line = ''
      units = 0
    }
    line += char
    units += charUnits
  }
  if (line) lines.push(line)

  if (lines.length <= maxLines) return lines
  const visible = lines.slice(0, maxLines)
  visible[maxLines - 1] = `${visible[maxLines - 1].replace(/.$/, '')}…`
  return visible
}

// 节点文案与高度统一在这里计算，布局只负责摆放
const measureNode = (raw) => {
  const lines = wrapLines(raw.title)
  return {
    ...raw,
    lines,
    height: paddingTop + lines.length * lineHeight + 12,
    selected: String(raw.id) === String(props.selectedTaskId)
  }
}

// 父节点出边、子节点入边的锚点与朝向
const outAnchor = (node) => {
  switch (direction.value) {
    case 'up':
      return { x: node.x + nodeWidth / 2, y: node.y, dx: 0, dy: -1 }
    case 'right':
      return { x: node.x + nodeWidth, y: node.y + node.height / 2, dx: 1, dy: 0 }
    case 'left':
      return { x: node.x, y: node.y + node.height / 2, dx: -1, dy: 0 }
    default:
      return { x: node.x + nodeWidth / 2, y: node.y + node.height, dx: 0, dy: 1 }
  }
}

const inAnchor = (node) => {
  switch (direction.value) {
    case 'up':
      return { x: node.x + nodeWidth / 2, y: node.y + node.height, dx: 0, dy: 1 }
    case 'right':
      return { x: node.x, y: node.y + node.height / 2, dx: -1, dy: 0 }
    case 'left':
      return { x: node.x + nodeWidth, y: node.y + node.height / 2, dx: 1, dy: 0 }
    default:
      return { x: node.x + nodeWidth / 2, y: node.y, dx: 0, dy: -1 }
  }
}

const crossVector = () => (isVertical.value ? { x: 1, y: 0 } : { x: 0, y: 1 })

// 折线转圆角路径：拐点用二次曲线过渡，避免生硬直角
const roundedPath = (points, radius = 8) => {
  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y)
  let d = `M${points[0].x} ${points[0].y}`

  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1]
    const cur = points[i]
    const next = points[i + 1]
    const lenIn = dist(prev, cur) || 1
    const lenOut = dist(cur, next) || 1
    const r = Math.min(radius, lenIn / 2, lenOut / 2)
    const inX = cur.x + (prev.x - cur.x) / lenIn * r
    const inY = cur.y + (prev.y - cur.y) / lenIn * r
    const outX = cur.x + (next.x - cur.x) / lenOut * r
    const outY = cur.y + (next.y - cur.y) / lenOut * r
    d += ` L${inX} ${inY} Q${cur.x} ${cur.y} ${outX} ${outY}`
  }

  const last = points[points.length - 1]
  return `${d} L${last.x} ${last.y}`
}

// 箭头长度（userSpaceOnUse）：线止于箭头尾部，箭头尖端正好落在节点边缘
const arrowLength = 6.4

// 三次贝塞尔 t=0.5 处的点，用于把删除按钮放在连线正中
const cubicMidpoint = (p0, c1, c2, p3) => ({
  x: (p0.x + 3 * c1.x + 3 * c2.x + p3.x) / 8,
  y: (p0.y + 3 * c1.y + 3 * c2.y + p3.y) / 8
})

// 统一生成连线路径：正向走平滑曲线，逆向绕到内容外侧
const createEdge = (from, to, key, backward = false, laneCross = null) => {
  const start = outAnchor(from)
  const tip = inAnchor(to)
  // dx/dy 是节点向外的法线，线端沿法线后退一个箭头长度，箭头尖端正好落在节点边缘
  const end = {
    x: tip.x + tip.dx * arrowLength,
    y: tip.y + tip.dy * arrowLength,
    dx: tip.dx,
    dy: tip.dy
  }
  const cross = crossVector()
  let d
  let midpoint

  if (from.id === to.id) {
    const half = 18
    const bulge = 42
    const startX = start.x - cross.x * half
    const startY = start.y - cross.y * half
    const endX = start.x + cross.x * half
    const endY = start.y + cross.y * half
    const c1 = { x: startX + start.dx * bulge - cross.x * bulge, y: startY + start.dy * bulge - cross.y * bulge }
    const c2 = { x: endX + start.dx * bulge + cross.x * bulge, y: endY + start.dy * bulge + cross.y * bulge }
    d = `M${startX} ${startY} C${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${endX} ${endY}`
    midpoint = cubicMidpoint({ x: startX, y: startY }, c1, c2, { x: endX, y: endY })
  } else if (backward) {
    // 回边绕到内容外侧再折回，入线方向与箭头一致
    const lane = laneCross ?? 0
    const stub = 26
    const crossOf = (point) => point.x * cross.x + point.y * cross.y
    const at = (point, mainOffset, crossValue) => ({
      x: point.x + point.dx * mainOffset + cross.x * (crossValue - crossOf(point)),
      y: point.y + point.dy * mainOffset + cross.y * (crossValue - crossOf(point))
    })

    const laneStart = at(start, stub, lane)
    const laneEnd = at(end, stub, lane)
    d = roundedPath([
      start,
      at(start, stub, crossOf(start)),
      laneStart,
      laneEnd,
      at(end, stub, crossOf(end)),
      end
    ])
    // 外围通道段的中心，属于连线中最容易辨认的位置
    midpoint = { x: (laneStart.x + laneEnd.x) / 2, y: (laneStart.y + laneEnd.y) / 2 }
  } else {
    // 两端控制点都沿主方向，曲线在节点处水平进出，箭头与线自然同向
    const distance = isVertical.value ? Math.abs(end.y - start.y) : Math.abs(end.x - start.x)
    const bend = Math.max(20, distance * 0.5)
    const c1 = { x: start.x + start.dx * bend, y: start.y + start.dy * bend }
    const c2 = { x: end.x + end.dx * bend, y: end.y + end.dy * bend }
    d = `M${start.x} ${start.y} C${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`
    midpoint = cubicMidpoint(start, c1, c2, end)
  }

  return { key, d, midpoint, from: from.id, to: to.id, deletable: from.id !== 'root' }
}

// 从展开森林还原唯一节点与全部边：回边节点折叠成指向目标的边
const buildGraphData = (forest) => {
  const nodes = new Map()
  const edges = []

  const walk = (node, parentId) => {
    const id = String(node.id)
    if (!node.isRef && !nodes.has(id)) nodes.set(id, node)
    if (parentId !== null) {
      edges.push({ from: parentId, to: node.isRef ? String(node.targetId) : id, isRef: !!node.isRef })
    }
    if (!node.isRef) {
      (node.children || []).forEach((child) => walk(child, id))
    }
  }

  ;(forest || []).forEach((root) => walk(root, null))
  return { nodes: [...nodes.values()], edges }
}

// 有向图：按强连通分量分层，环内节点顺序排列，回边绕行展示
const graphLayout = computed(() => {
  const { nodes: rawNodes, edges: rawEdges } = buildGraphData(props.nodes)
  if (rawNodes.length === 0) return { nodes: [], edges: [], contentWidth: 0, contentHeight: 0 }

  const nodes = rawNodes.map(measureNode)
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const adjacency = new Map(nodes.map((node) => [node.id, []]))

  rawEdges.forEach((edge) => {
    if (byId.has(edge.from) && byId.has(edge.to)) adjacency.get(edge.from).push(edge.to)
  })

  // Tarjan 求强连通分量
  let counter = 0
  const indices = new Map()
  const lowlinks = new Map()
  const stack = []
  const onStack = new Set()
  const components = []
  const componentOf = new Map()

  const connect = (id) => {
    indices.set(id, counter)
    lowlinks.set(id, counter)
    counter += 1
    stack.push(id)
    onStack.add(id)

    for (const next of adjacency.get(id)) {
      if (!indices.has(next)) {
        connect(next)
        lowlinks.set(id, Math.min(lowlinks.get(id), lowlinks.get(next)))
      } else if (onStack.has(next)) {
        lowlinks.set(id, Math.min(lowlinks.get(id), indices.get(next)))
      }
    }

    if (lowlinks.get(id) === indices.get(id)) {
      const component = []
      let member
      do {
        member = stack.pop()
        onStack.delete(member)
        component.push(member)
        componentOf.set(member, components.length)
      } while (member !== id)
      components.push(component)
    }
  }

  nodes.forEach((node) => {
    if (!indices.has(node.id)) connect(node.id)
  })

  // 分量缩点后做最长路径分层
  const componentEdges = Array.from({ length: components.length }, () => new Set())
  rawEdges.forEach((edge) => {
    const from = componentOf.get(edge.from)
    const to = componentOf.get(edge.to)
    if (from === undefined || to === undefined || from === to) return
    componentEdges[from].add(to)
  })

  const indegree = new Array(components.length).fill(0)
  componentEdges.forEach((targets) => targets.forEach((to) => { indegree[to] += 1 }))

  const queue = []
  indegree.forEach((count, index) => { if (count === 0) queue.push(index) })

  const componentLayer = new Array(components.length).fill(0)
  while (queue.length > 0) {
    const current = queue.shift()
    componentEdges[current].forEach((next) => {
      componentLayer[next] = Math.max(componentLayer[next], componentLayer[current] + 1)
      indegree[next] -= 1
      if (indegree[next] === 0) queue.push(next)
    })
  }

  // 环内节点按顺序占一层，让环方向仍然沿主方向可读
  const nodeLayer = new Map()
  components.forEach((component, index) => {
    const ordered = [...component].sort((a, b) => {
      const diff = Number(a) - Number(b)
      return Number.isFinite(diff) && diff !== 0 ? diff : String(a).localeCompare(String(b))
    })
    ordered.forEach((id, offset) => nodeLayer.set(id, componentLayer[index] + offset))
  })

  // 每层沿交叉方向排开，层与层沿主方向堆叠
  const layers = new Map()
  nodes.forEach((node) => {
    const layer = nodeLayer.get(node.id) ?? 0
    if (!layers.has(layer)) layers.set(layer, [])
    layers.get(layer).push(node)
  })

  const layerKeys = [...layers.keys()].sort((a, b) => a - b)
  const layerMain = new Map()
  layerKeys.forEach((layer) => {
    layerMain.set(layer, Math.max(...layers.get(layer).map(nodeMainSize)))
  })

  let cursorMain = 0
  const layerStart = new Map()
  layerKeys.forEach((layer) => {
    layerStart.set(layer, cursorMain)
    cursorMain += layerMain.get(layer) + mainGap
  })
  const contentMain = Math.max(cursorMain - mainGap, 0)

  // 交叉方向：分层图布局。层内顺序按父节点位置（重心）排序，坐标由「贴近父节点 + 同层最小间距」求得
  const crossCenter = new Map()
  const crossSizeOf = (id) => nodeCrossSize(byId.get(id))

  // 只统计沿主方向向前的边；回边绕行展示，不参与交叉方向定位
  const parentsOf = new Map(nodes.map((node) => [node.id, []]))
  const childrenOf = new Map(nodes.map((node) => [node.id, []]))
  rawEdges.forEach((edge) => {
    if (edge.from === edge.to) return
    if (!parentsOf.has(edge.to) || !childrenOf.has(edge.from)) return
    const fromLayer = nodeLayer.get(edge.from) ?? 0
    const toLayer = nodeLayer.get(edge.to) ?? 0
    if (fromLayer >= toLayer) return
    parentsOf.get(edge.to).push(edge.from)
    childrenOf.get(edge.from).push(edge.to)
  })

  // 层内顺序：森林的深度优先序，兄弟天然相邻，作为初始顺序
  const order = new Map(layerKeys.map((layer) => [layer, []]))
  const dfsIndex = new Map()
  let dfsCursor = 0
  const walkForest = (node) => {
    const id = String(node.id)
    if (dfsIndex.has(id)) return
    dfsIndex.set(id, dfsCursor)
    dfsCursor += 1
    ;(node.children || []).forEach((child) => {
      if (byId.has(String(child.id))) walkForest(child)
    })
  }
  ;(props.nodes || []).forEach((root) => {
    if (byId.has(String(root.id))) walkForest(root)
  })
  nodes.forEach((node) => {
    const layer = nodeLayer.get(node.id) ?? 0
    order.get(layer).push(node)
  })
  order.forEach((list) => list.sort((a, b) => (dfsIndex.get(a.id) ?? 0) - (dfsIndex.get(b.id) ?? 0)))

  // 初始坐标：按层内顺序依次排开
  layerKeys.forEach((layer) => {
    let cursor = 0
    order.get(layer).forEach((node) => {
      const half = crossSizeOf(node.id) / 2
      crossCenter.set(node.id, cursor + half)
      cursor += crossSizeOf(node.id) + crossGap
    })
  })

  // 保序回归（PAVA）：把期望位置投影到「同层最小间距」约束上，得到该层的最优解
  const projectLayer = (layer) => {
    const list = order.get(layer)
    if (list.length === 0) return

    const offsets = [0]
    for (let i = 1; i < list.length; i += 1) {
      const gap = (crossSizeOf(list[i - 1].id) + crossSizeOf(list[i].id)) / 2 + crossGap
      offsets.push(offsets[i - 1] + gap)
    }

    // 相邻违例合并成块，块内取均值，保证结果单调不减
    const blocks = []
    list.forEach((node, index) => {
      blocks.push({ sum: crossCenter.get(node.id) - offsets[index], count: 1 })
      while (blocks.length > 1) {
        const last = blocks[blocks.length - 1]
        const prev = blocks[blocks.length - 2]
        if (prev.sum / prev.count <= last.sum / last.count) break
        prev.sum += last.sum
        prev.count += last.count
        blocks.pop()
      }
    })

    const desired = list.map((node) => crossCenter.get(node.id))
    let cursor = 0
    blocks.forEach((block) => {
      const value = block.sum / block.count
      for (let i = 0; i < block.count; i += 1) {
        crossCenter.set(list[cursor].id, value + offsets[cursor])
        cursor += 1
      }
    })

    // 投影会整体推移整层，按期望均值平移回来，避免逐层累积漂移
    const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length
    const drift = mean(desired) - mean(list.map((node) => crossCenter.get(node.id)))
    list.forEach((node) => crossCenter.set(node.id, crossCenter.get(node.id) + drift))
  }

  const averageOf = (ids) => {
    const values = ids.map((id) => crossCenter.get(id)).filter((value) => value !== undefined)
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
  }

  // 逐层定位：down 让子节点贴近父节点（多父节点取各父节点位置的平均值），
  // up 让父节点居中于子节点带。每层定位后投影回间距约束，避免重叠。
  const relaxLayer = (layer, mode) => {
    order.get(layer).forEach((node) => {
      const parents = averageOf(parentsOf.get(node.id))
      const children = averageOf(childrenOf.get(node.id))
      // up 时叶子没有子节点，保持当前位置，由父节点向它靠拢
      const target = mode === 'down' ? (parents ?? children) : children
      if (target !== null) crossCenter.set(node.id, target)
    })
    // 按期望位置重排层内顺序，投影时才能保持左右关系与期望一致
    order.get(layer).sort((a, b) => crossCenter.get(a.id) - crossCenter.get(b.id))
    projectLayer(layer)
  }

  // 交替收敛：父节点先居中于子节点带，子节点再贴近父节点，最后以子节点贴近父节点收尾
  for (let round = 0; round < 3; round += 1) {
    ;[...layerKeys].reverse().forEach((layer) => relaxLayer(layer, 'up'))
    layerKeys.forEach((layer) => relaxLayer(layer, 'down'))
  }

  let minCross = Infinity
  let maxCross = -Infinity
  crossCenter.forEach((center, id) => {
    const half = crossSizeOf(id) / 2
    minCross = Math.min(minCross, center - half)
    maxCross = Math.max(maxCross, center + half)
  })
  const contentCross = maxCross - minCross

  nodes.forEach((node) => {
    const cross = crossCenter.get(node.id) - nodeCrossSize(node) / 2 - minCross
    const layer = nodeLayer.get(node.id) ?? 0
    const mainOffset = layerStart.get(layer) + (layerMain.get(layer) - nodeMainSize(node)) / 2
    if (isVertical.value) {
      node.x = cross
      node.y = isForward.value ? mainOffset : contentMain - mainOffset - node.height
    } else {
      node.y = cross
      node.x = isForward.value ? mainOffset : contentMain - mainOffset - nodeWidth
    }
  })

  const routedEdges = rawEdges.map((edge, index) => {
    const from = byId.get(edge.from)
    const to = byId.get(edge.to)
    if (!from || !to) return null
    const backward = (nodeLayer.get(to.id) ?? 0) <= (nodeLayer.get(from.id) ?? 0)
    // 回边绕到内容外侧，通道按边序号错开避免重叠
    const laneCross = backward
      ? contentCross + 24 + (index % 4) * 14
      : null
    return createEdge(from, to, `${edge.from}->${edge.to}-${index}`, backward, laneCross)
  }).filter(Boolean)

  return {
    nodes,
    edges: routedEdges,
    contentWidth: isVertical.value ? contentCross : contentMain,
    contentHeight: isVertical.value ? contentMain : contentCross
  }
})

const layout = computed(() => graphLayout.value)

const layoutSignature = computed(() =>
  `${direction.value}:${layout.value.nodes.map((node) => node.id).join('|')}`)

let hasInteracted = false

// 上次离开时的平移与缩放：尺寸未变时直接沿用，不重新适配
const savedView = readUiState('mindmap-view', null)
const restoredView = Boolean(savedView
  && Number.isFinite(savedView.x)
  && Number.isFinite(savedView.y)
  && Number.isFinite(savedView.scale)
  && savedView.scale > 0)
if (restoredView) {
  Object.assign(view, savedView)
  hasInteracted = true
}

// 平移缩放后记住视口；连续操作时合并成一次写入
let saveViewTimer = null
watch(view, () => {
  if (!hasInteracted) return
  clearTimeout(saveViewTimer)
  saveViewTimer = setTimeout(() => writeUiState('mindmap-view', { ...view }), 200)
}, { deep: true })

const fitView = () => {
  const el = container.value
  if (!el) return
  const { contentWidth, contentHeight } = layout.value
  if (!contentWidth || !size.width || !size.height) return

  const pad = 48
  const scale = Math.min(
    (size.width - pad * 2) / contentWidth,
    (size.height - pad * 2) / contentHeight,
    1.25
  )
  view.scale = Math.max(0.15, scale)
  view.x = (size.width - contentWidth * view.scale) / 2
  view.y = (size.height - contentHeight * view.scale) / 2
}

const selectNode = (node) => {
  // 拖拽建链接后紧跟的 click 不应改变选中
  if (Date.now() - lastDragEndAt < 250) return
  if (node.isRoot) return
  selectedEdgeKey.value = null
  container.value?.focus({ preventScroll: true })
  emit('task-selected', Number(node.id))
}

// 连线选中：与节点选中互斥，选中连线时收起任务详情
const selectedEdgeKey = ref(null)

// 当前选中的连线，用于定位中点上的删除按钮
const selectedEdge = computed(() =>
  layout.value.edges.find((edge) => edge.key === selectedEdgeKey.value) ?? null)

// 未选中的连线只铺在节点下层，选中的单独画在节点之上
const baseEdges = computed(() =>
  layout.value.edges.filter((edge) => edge.key !== selectedEdgeKey.value))

const selectEdge = (edge) => {
  if (!edge.deletable) return
  container.value?.focus({ preventScroll: true })
  selectedEdgeKey.value = selectedEdgeKey.value === edge.key ? null : edge.key
  if (selectedEdgeKey.value) emit('task-selected', null)
}

// 删除选中连线：只解除父子引用，任务本身保留
const deleteSelectedEdge = () => {
  const edge = selectedEdge.value
  if (!edge || !edge.deletable) return
  selectedEdgeKey.value = null
  emit('unlink-task', { parentId: Number(edge.from), childId: Number(edge.to) })
}

// 布局变化后旧连线可能已不存在，清掉悬空的选中
watch(layout, () => {
  if (selectedEdgeKey.value == null) return
  if (!layout.value.edges.some((edge) => edge.key === selectedEdgeKey.value)) {
    selectedEdgeKey.value = null
  }
})

// 森林索引：键盘导航与新建需要知道每个任务的父级与同级顺序
// 多父链接等价，引用节点也要计入父级的子列表，否则从第二个父级无法导航到该任务
const nodeIndex = computed(() => {
  const parentOf = new Map()
  // null 键存放根层级任务，供同级导航使用
  const childrenOf = new Map([[null, []]])

  const walk = (node, parentId) => {
    const id = node.isRef ? String(node.targetId) : String(node.id)
    if (!childrenOf.has(id)) childrenOf.set(id, [])
    if (parentId !== null) childrenOf.get(parentId)?.push(id)
    if (node.isRef) return

    if (!parentOf.has(id)) parentOf.set(id, parentId)
    ;(node.children || []).forEach((child) => walk(child, id))
  }

  ;(props.nodes || []).forEach((root) => walk(root, null))
  return { parentOf, childrenOf }
})

const selectedId = computed(() => (props.selectedTaskId == null ? null : String(props.selectedTaskId)))

// 主方向键沿层级深入/返回，交叉方向键在同级之间移动
const axisKeys = computed(() => {
  switch (direction.value) {
    case 'down':
      return { forward: 'ArrowDown', backward: 'ArrowUp' }
    case 'up':
      return { forward: 'ArrowUp', backward: 'ArrowDown' }
    case 'left':
      return { forward: 'ArrowLeft', backward: 'ArrowRight' }
    default:
      return { forward: 'ArrowRight', backward: 'ArrowLeft' }
  }
})

const focusTask = (id) => {
  if (id == null) return
  selectedEdgeKey.value = null
  emit('task-selected', Number(id))
}

const navigate = (key) => {
  const id = selectedId.value
  if (!id) return
  const { parentOf, childrenOf } = nodeIndex.value
  const { forward, backward } = axisKeys.value

  if (key === forward) {
    const children = childrenOf.get(id) || []
    if (children.length > 0) focusTask(children[0])
    return
  }

  if (key === backward) {
    const parent = parentOf.get(id)
    if (parent && parent !== 'root') focusTask(parent)
    return
  }

  const siblings = childrenOf.get(parentOf.get(id)) || []
  const index = siblings.indexOf(id)
  if (index === -1) return
  const step = key === 'ArrowUp' || key === 'ArrowLeft' ? -1 : 1
  focusTask(siblings[index + step])
}

// 新建任务：同级插到当前节点之后，子级挂到当前节点下
const createSibling = () => {
  const id = selectedId.value
  const parent = id ? nodeIndex.value.parentOf.get(id) : 'root'
  emit('create-task', {
    parentId: parent && parent !== 'root' ? Number(parent) : null,
    afterId: id ? Number(id) : null
  })
}

const createChild = () => {
  const id = selectedId.value
  if (!id) return
  emit('create-task', { parentId: Number(id), afterId: null })
}

const editingId = ref(null)
const editingText = ref('')
const editInput = ref(null)
// 已消费的新建标记，避免提交后又被父级传入的 id 重新打开
let consumedEditId = null

const editingNode = computed(() => {
  if (editingId.value == null) return null
  return layout.value.nodes.find((node) => node.id === String(editingId.value)) ?? null
})

// 输入框跟随节点位置与缩放，始终覆盖在节点上
const editStyle = computed(() => {
  const node = editingNode.value
  if (!node) return {}
  return {
    left: `${view.x + node.x * view.scale}px`,
    top: `${view.y + node.y * view.scale}px`,
    width: `${nodeWidth * view.scale}px`,
    height: `${node.height * view.scale}px`,
    fontSize: `${fontSize * view.scale}px`
  }
})

const startEdit = (node) => {
  if (!node || node.isRoot || node.isRef) return
  editingId.value = Number(node.id)
  editingText.value = node.title
  nextTick(() => {
    editInput.value?.focus()
    editInput.value?.select()
  })
}

const startEditById = (id) => {
  const node = layout.value.nodes.find((item) => item.id === String(id))
  if (node) startEdit(node)
}

const commitEdit = () => {
  const id = editingId.value
  if (id == null) return
  const title = editingText.value.trim()
  editingId.value = null
  // 交还焦点，键盘操作可以继续
  container.value?.focus({ preventScroll: true })
  if (!title) return
  const node = layout.value.nodes.find((item) => item.id === String(id))
  if (node && node.title === title) return
  emit('rename-task', { id, title })
}

const cancelEdit = () => {
  editingId.value = null
  container.value?.focus({ preventScroll: true })
}

const onEditKeydown = (event) => {
  if (event.key === 'Enter') {
    event.preventDefault()
    commitEdit()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    cancelEdit()
  }
}

// 新建后父级指定要重命名的任务，等它出现在布局里再打开输入框
watch([() => props.editTaskId, layout], ([id]) => {
  if (id == null || id === consumedEditId) return
  const node = layout.value.nodes.find((item) => item.id === String(id))
  if (!node) return
  consumedEditId = id
  startEdit(node)
})

const onKeydown = (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return
  const id = selectedId.value

  switch (event.key) {
    case 'Enter':
      event.preventDefault()
      createSibling()
      return
    case 'Tab':
      event.preventDefault()
      createChild()
      return
    case 'F2':
      event.preventDefault()
      if (id) startEditById(id)
      return
    case 'Delete':
    case 'Backspace':
      // 选中连线时优先删除连线，否则删除任务
      if (selectedEdgeKey.value != null) {
        event.preventDefault()
        deleteSelectedEdge()
        return
      }
      if (!id) return
      event.preventDefault()
      emit('delete-task', Number(id))
      return
    case ' ':
      if (!id) return
      event.preventDefault()
      emit('toggle-done', Number(id))
      return
    case 'Escape':
      if (selectedEdgeKey.value != null) {
        selectedEdgeKey.value = null
        return
      }
      emit('task-selected', null)
      return
    case 'ArrowUp':
    case 'ArrowDown':
    case 'ArrowLeft':
    case 'ArrowRight':
      event.preventDefault()
      navigate(event.key)
      return
    default:
  }
}

// 点击空白画布取消连线选中
const onCanvasClick = () => {
  selectedEdgeKey.value = null
}

// 以指针位置为中心缩放，避免缩放后视线漂移
const onWheel = (event) => {
  const el = container.value
  if (!el) return
  hasInteracted = true
  const rect = el.getBoundingClientRect()
  const pointerX = event.clientX - rect.left
  const pointerY = event.clientY - rect.top
  const nextScale = Math.min(2.5, Math.max(0.15, view.scale * Math.exp(-event.deltaY * 0.0015)))
  const ratio = nextScale / view.scale

  view.x = pointerX - (pointerX - view.x) * ratio
  view.y = pointerY - (pointerY - view.y) * ratio
  view.scale = nextScale
}

let panStart = { x: 0, y: 0, originX: 0, originY: 0 }

// 拖拽建链接：从节点拖到另一个节点上，把源节点链接为目标节点的子任务
const dragState = reactive({ active: false, sourceId: null, targetId: null, preview: null, moved: false })
let dragStart = { x: 0, y: 0 }
let lastDragEndAt = 0

// 屏幕坐标换算成画布坐标，供命中检测与预览线使用
const toGraphPoint = (event) => {
  const rect = container.value?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }
  return {
    x: (event.clientX - rect.left - view.x) / view.scale,
    y: (event.clientY - rect.top - view.y) / view.scale
  }
}

// 命中检测：指针落在哪个节点矩形内
const nodeAtPoint = (point) => layout.value.nodes.find((node) => (
  point.x >= node.x && point.x <= node.x + nodeWidth
  && point.y >= node.y && point.y <= node.y + node.height
)) ?? null

const onNodePointerDown = (event, node) => {
  if (event.button !== 0 || node.isRoot || node.isRef) return
  hasInteracted = true
  dragStart = { x: event.clientX, y: event.clientY }
  dragState.active = true
  dragState.sourceId = node.id
  dragState.targetId = null
  dragState.preview = null
  dragState.moved = false
  // 不用 pointer capture：它会把 click 改派到画布，节点自身的选中与双击会失效
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragEnd)
}

// 预览线从指针连向源节点的入边锚点，箭头指向被拖动的节点，表示它将成为目标节点的子任务
const updateDrag = (event) => {
  const source = layout.value.nodes.find((node) => node.id === dragState.sourceId)
  if (!source) return
  const point = toGraphPoint(event)
  const tip = inAnchor(source)
  // 线端沿法线后退一个箭头长度，箭头尖端正好落在节点边缘
  const end = { x: tip.x + tip.dx * arrowLength, y: tip.y + tip.dy * arrowLength }
  dragState.preview = `M${point.x} ${point.y} L${end.x} ${end.y}`

  const hit = nodeAtPoint(point)
  const linkable = hit && hit.id !== dragState.sourceId && !hit.isRef
  dragState.targetId = linkable ? hit.id : null
}

const onDragMove = (event) => {
  if (!dragState.active) return
  if (!dragState.moved) {
    const distance = Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y)
    if (distance < 4) return
    dragState.moved = true
  }
  updateDrag(event)
}

const onDragEnd = () => {
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)

  const { active, sourceId, targetId, moved } = dragState
  dragState.active = false
  dragState.sourceId = null
  dragState.targetId = null
  dragState.preview = null
  dragState.moved = false
  if (!active || !moved || !targetId) return

  // 拖拽结束后紧跟的 click 不应再改变选中
  lastDragEndAt = Date.now()
  emit('link-task', { sourceId: Number(sourceId), targetId: Number(targetId) })
}

const onPointerDown = (event) => {
  if (event.button !== 0) return
  hasInteracted = true
  panning.value = true
  panStart = { x: event.clientX, y: event.clientY, originX: view.x, originY: view.y }
  container.value?.setPointerCapture(event.pointerId)
}

const onPointerMove = (event) => {
  if (!panning.value) return
  view.x = panStart.originX + (event.clientX - panStart.x)
  view.y = panStart.originY + (event.clientY - panStart.y)
}

const endPan = () => {
  panning.value = false
}

let resizeObserver = null

onMounted(() => {
  resizeObserver = new ResizeObserver((entries) => {
    const box = entries[0]?.contentRect
    if (!box) return
    size.width = box.width
    size.height = box.height
    if (!hasInteracted) fitView()
  })
  if (container.value) resizeObserver.observe(container.value)
  if (!restoredView) nextTick(fitView)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  if (saveViewTimer) clearTimeout(saveViewTimer)
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
})

// 模式、方向或任务增删后重新适配视图；恢复的视口先让数据落位，不打断离开时的位置
let skipNextAutoFit = restoredView
watch(layoutSignature, () => {
  if (skipNextAutoFit) {
    skipNextAutoFit = false
    return
  }
  nextTick(fitView)
})
</script>

<style scoped>
/* 点阵底纹：与参考图一致的空旷感，暗色下更明显 */
.mindmap-canvas {
  background-color: #fafafa;
}

@media (prefers-color-scheme: dark) {
  .mindmap-canvas {
    background-color: #141414;
  }
}
</style>
