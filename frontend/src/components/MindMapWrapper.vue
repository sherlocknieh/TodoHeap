<template>
  <!-- 自研思维导图：SVG 渲染，支持滚轮缩放与拖拽平移 -->
  <div ref="container"
    class="mindmap-canvas relative w-full h-full overflow-hidden select-none"
    :class="panning ? 'cursor-grabbing' : 'cursor-grab'"
    @wheel.prevent="onWheel" @pointerdown="onPointerDown" @pointermove="onPointerMove"
    @pointerup="endPan" @pointerleave="endPan" @click.stop @dblclick="fitView">
    <svg class="block w-full h-full touch-none" :viewBox="`0 0 ${size.width} ${size.height}`">
      <defs>
        <marker id="mm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6"
          orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" fill="#a3a3a3" />
        </marker>
        <marker id="mm-arrow-ref" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6"
          orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" fill="#13b566" />
        </marker>
      </defs>

      <g :transform="`translate(${view.x} ${view.y}) scale(${view.scale})`">
        <!-- 连线：跨引用与回边用虚线，其余为平滑曲线 -->
        <path v-for="edge in layout.edges" :key="edge.key" :d="edge.d" fill="none" stroke-linecap="round"
          :class="edge.isRef ? 'stroke-accent-500 dark:stroke-accent-400' : 'stroke-neutral-300 dark:stroke-neutral-600'"
          :stroke-width="edge.isRef ? 1.5 : 1.2" :stroke-dasharray="edge.isRef ? '5 4' : undefined"
          :marker-end="edge.isRef ? 'url(#mm-arrow-ref)' : 'url(#mm-arrow)'" />

        <!-- 节点 -->
        <g v-for="node in layout.nodes" :key="node.id" :transform="`translate(${node.x} ${node.y})`"
          :opacity="node.completed_at ? 0.55 : 1" :class="node.isRoot ? 'cursor-default' : 'cursor-pointer'"
          @pointerdown.stop @dblclick.stop="selectNode(node)" @click.stop="selectNode(node)">
          <rect :width="nodeWidth" :height="node.height" rx="8" :stroke-width="node.selected ? 2 : 1"
            :stroke-dasharray="node.isRef ? '5 4' : undefined" class="transition-colors" :class="[
              node.isRef
                ? 'stroke-accent-300 dark:stroke-accent-700'
                : node.selected
                  ? 'stroke-accent-600 dark:stroke-accent-400'
                  : 'stroke-neutral-200 dark:stroke-neutral-700',
              node.isRoot
                ? 'fill-accent-700 dark:fill-accent-500'
                : node.selected
                  ? 'fill-accent-50 dark:fill-neutral-800'
                  : 'fill-white dark:fill-neutral-900'
            ]" />
          <text :x="10" :y="0" class="text-[13px] font-medium" :class="node.isRoot
            ? 'fill-white'
            : node.isRef
              ? 'fill-neutral-500 dark:fill-neutral-400'
              : 'fill-neutral-800 dark:fill-neutral-100'">
            <tspan v-for="(line, index) in node.lines" :key="index" :x="10"
              :dy="index === 0 ? paddingTop + fontSize : lineHeight">{{ line }}</tspan>
          </text>
        </g>
      </g>
    </svg>

    <!-- 布局与方向切换 -->
    <div class="absolute top-3 right-3 z-10 flex items-center gap-2" @pointerdown.stop>
      <div
        class="flex items-center gap-0.5 rounded-lg border border-hairline dark:border-hairline-dark bg-white/95 dark:bg-neutral-900/95 p-0.5 text-[11px] shadow-sm">
        <button v-for="option in modeOptions" :key="option.value" :title="option.label"
          class="px-2 py-1 rounded-md transition-colors"
          :class="mode === option.value
            ? 'bg-accent-700 text-white dark:bg-accent-400 dark:text-accent-950'
            : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'"
          @click.stop="mode = option.value">{{ option.text }}</button>
      </div>

      <div
        class="flex items-center gap-0.5 rounded-lg border border-hairline dark:border-hairline-dark bg-white/95 dark:bg-neutral-900/95 p-0.5 shadow-sm">
        <button v-for="option in directionOptions" :key="option.value" :title="option.label"
          class="p-1 rounded-md transition-colors"
          :class="direction === option.value
            ? 'bg-accent-700 text-white dark:bg-accent-400 dark:text-accent-950'
            : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'"
          @click.stop="direction = option.value">
          <AppIcon :name="option.icon" :size="13" />
        </button>
      </div>
    </div>

    <!-- 视图控件 -->
    <div class="absolute bottom-3 right-3 z-10 flex items-center gap-1" @pointerdown.stop>
      <button
        class="bg-white dark:bg-neutral-900 border border-hairline dark:border-hairline-dark rounded p-1.5 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
        title="适应视图" @click.stop="fitView">
        <AppIcon name="target" :size="14" />
      </button>
    </div>
    <p class="absolute bottom-3 left-3 z-10 text-[11px] text-neutral-400 dark:text-neutral-600 pointer-events-none">
      滚轮缩放 · 拖拽平移 · 双击复位
    </p>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  selectedTaskId: { type: Number, default: null }
})

const emit = defineEmits(['task-selected'])

const nodeWidth = 200
const fontSize = 13
const lineHeight = 16
const paddingTop = 10
const maxLines = 3
const crossGap = 40
const mainGap = 52
const textUnitsPerLine = 13

const container = ref(null)
const size = reactive({ width: 0, height: 0 })
const view = reactive({ x: 0, y: 0, scale: 1 })
const panning = ref(false)
const mode = ref('tree')
const direction = ref('down')

const modeOptions = [
  { value: 'tree', text: '树', label: '展开树模式' },
  { value: 'graph', text: '图', label: '有向图模式' }
]

const directionOptions = [
  { value: 'down', icon: 'chevronDown', label: '从上到下' },
  { value: 'right', icon: 'chevronRight', label: '从左到右' },
  { value: 'up', icon: 'chevronUp', label: '从下到上' },
  { value: 'left', icon: 'chevronLeft', label: '从右到左' }
]

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

// 节点文案与高度统一在这里计算，两种布局共用
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

// 统一生成连线路径：正向走平滑曲线，逆向与自环绕行展示
const createEdge = (from, to, key, isRef = false, backward = false) => {
  const start = outAnchor(from)
  const end = inAnchor(to)
  const cross = crossVector()
  let d

  if (from.id === to.id) {
    const half = 18
    const bulge = 42
    const startX = start.x - cross.x * half
    const startY = start.y - cross.y * half
    const endX = start.x + cross.x * half
    const endY = start.y + cross.y * half
    d = `M${startX} ${startY} C${startX + start.dx * bulge - cross.x * bulge} ${startY + start.dy * bulge - cross.y * bulge}, ${endX + start.dx * bulge + cross.x * bulge} ${endY + start.dy * bulge + cross.y * bulge}, ${endX} ${endY}`
  } else if (backward) {
    const bulge = 110
    const along = 40
    d = `M${start.x} ${start.y} C${start.x + cross.x * bulge + start.dx * along} ${start.y + cross.y * bulge + start.dy * along}, ${end.x + cross.x * bulge + end.dx * along} ${end.y + cross.y * bulge + end.dy * along}, ${end.x} ${end.y}`
  } else {
    const distance = isVertical.value ? Math.abs(end.y - start.y) : Math.abs(end.x - start.x)
    const bend = Math.max(20, distance * 0.5)
    d = `M${start.x} ${start.y} C${start.x + start.dx * bend} ${start.y + start.dy * bend}, ${end.x + end.dx * bend} ${end.y + end.dy * bend}, ${end.x} ${end.y}`
  }

  return { key, isRef, d }
}

// 展开树：子节点沿交叉方向排开，父节点居中于子节点跨度
const treeLayout = computed(() => {
  const depthMain = []
  const edges = []
  const vertical = isVertical.value
  const forward = isForward.value

  const measure = (raw, depth) => {
    const node = measureNode(raw)
    node.depth = depth
    depthMain[depth] = Math.max(depthMain[depth] || 0, nodeMainSize(node))
    node.children = (raw.children || []).map((child) => measure(child, depth + 1))

    const childrenCross = node.children.reduce((sum, child) => sum + child.subtreeCross, 0)
      + Math.max(0, node.children.length - 1) * crossGap
    node.subtreeCross = Math.max(nodeCrossSize(node), childrenCross)
    return node
  }

  const roots = (props.nodes || []).map((root) => measure(root, 0))

  const mainStart = []
  let cursorMain = 0
  depthMain.forEach((depthSize, depth) => {
    mainStart[depth] = cursorMain
    cursorMain += depthSize + mainGap
  })
  const contentMain = Math.max(cursorMain - mainGap, 0)

  let cursorCross = 0
  const place = (node, crossLeft) => {
    const mainOffset = mainStart[node.depth] + (depthMain[node.depth] - nodeMainSize(node)) / 2
    const crossCenter = crossLeft + node.subtreeCross / 2

    if (vertical) {
      node.x = crossCenter - nodeWidth / 2
      node.y = forward ? mainOffset : contentMain - mainOffset - node.height
    } else {
      node.y = crossCenter - node.height / 2
      node.x = forward ? mainOffset : contentMain - mainOffset - nodeWidth
    }

    const childrenCross = node.children.reduce((sum, child) => sum + child.subtreeCross, 0)
      + Math.max(0, node.children.length - 1) * crossGap
    let childCrossLeft = crossLeft + (node.subtreeCross - childrenCross) / 2

    node.children.forEach((child, index) => {
      place(child, childCrossLeft)
      edges.push(createEdge(node, child, `${node.id}->${child.id}-${index}`, !!child.isRef))
      childCrossLeft += child.subtreeCross + crossGap
    })
  }

  roots.forEach((root) => {
    place(root, cursorCross)
    cursorCross += root.subtreeCross + crossGap
  })

  const nodes = []
  const collect = (node) => {
    nodes.push(node)
    node.children.forEach(collect)
  }
  roots.forEach(collect)

  const contentCross = Math.max(cursorCross - crossGap, 0)
  return {
    nodes,
    edges,
    contentWidth: vertical ? contentCross : contentMain,
    contentHeight: vertical ? contentMain : contentCross
  }
})

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
  const layerCross = new Map()
  const layerMain = new Map()
  let maxCross = 0

  layerKeys.forEach((layer) => {
    layers.get(layer).sort((a, b) => {
      const diff = Number(a.id) - Number(b.id)
      return Number.isFinite(diff) && diff !== 0 ? diff : String(a.id).localeCompare(String(b.id))
    })
    const list = layers.get(layer)
    layerCross.set(layer, list.reduce((sum, node) => sum + nodeCrossSize(node), 0)
      + Math.max(0, list.length - 1) * crossGap)
    layerMain.set(layer, Math.max(...list.map(nodeMainSize)))
    maxCross = Math.max(maxCross, layerCross.get(layer))
  })

  let cursorMain = 0
  const layerStart = new Map()
  layerKeys.forEach((layer) => {
    layerStart.set(layer, cursorMain)
    cursorMain += layerMain.get(layer) + mainGap
  })
  const contentMain = Math.max(cursorMain - mainGap, 0)

  layerKeys.forEach((layer) => {
    const list = layers.get(layer)
    let cursorCross = (maxCross - layerCross.get(layer)) / 2
    list.forEach((node) => {
      const mainOffset = layerStart.get(layer) + (layerMain.get(layer) - nodeMainSize(node)) / 2
      if (isVertical.value) {
        node.x = cursorCross
        node.y = isForward.value ? mainOffset : contentMain - mainOffset - node.height
      } else {
        node.y = cursorCross
        node.x = isForward.value ? mainOffset : contentMain - mainOffset - nodeWidth
      }
      cursorCross += nodeCrossSize(node) + crossGap
    })
  })

  const routedEdges = rawEdges.map((edge, index) => {
    const from = byId.get(edge.from)
    const to = byId.get(edge.to)
    if (!from || !to) return null
    const backward = (nodeLayer.get(to.id) ?? 0) <= (nodeLayer.get(from.id) ?? 0)
    return createEdge(from, to, `${edge.from}->${edge.to}-${index}`, edge.isRef || backward, backward)
  }).filter(Boolean)

  return {
    nodes,
    edges: routedEdges,
    contentWidth: isVertical.value ? maxCross : contentMain,
    contentHeight: isVertical.value ? contentMain : maxCross
  }
})

const layout = computed(() => (mode.value === 'tree' ? treeLayout.value : graphLayout.value))

const layoutSignature = computed(() =>
  `${mode.value}:${direction.value}:${layout.value.nodes.map((node) => node.id).join('|')}`)

let hasInteracted = false

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
  if (node.isRoot) return
  emit('task-selected', node.isRef ? node.targetId : Number(node.id))
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
  nextTick(fitView)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

// 模式、方向或任务增删后重新适配视图；仅标题变化时保持当前缩放与位置
watch(layoutSignature, () => nextTick(fitView))
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
