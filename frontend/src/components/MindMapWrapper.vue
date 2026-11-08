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
        <!-- 连线：回边用虚线，直接展示 DAG 的多父引用与环 -->
        <path v-for="edge in layout.edges" :key="edge.key" :d="edge.d" fill="none"
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
          <text :x="10" :y="10" class="text-[13px] font-medium" :class="node.isRoot
            ? 'fill-white'
            : node.isRef
              ? 'fill-neutral-500 dark:fill-neutral-400'
              : 'fill-neutral-800 dark:fill-neutral-100'">
            <tspan v-for="(line, index) in node.lines" :key="index" :x="10"
              :dy="index === 0 ? 10 + fontSize : lineHeight">{{ line }}</tspan>
          </text>
        </g>
      </g>
    </svg>

    <!-- 布局切换 -->
    <div
      class="absolute top-3 right-3 z-10 flex items-center gap-0.5 rounded-lg border border-hairline dark:border-hairline-dark bg-white/95 dark:bg-neutral-900/95 p-0.5 text-[11px] shadow-sm"
      @pointerdown.stop>
      <button v-for="option in modeOptions" :key="option.value" :title="option.label"
        class="px-2 py-1 rounded-md transition-colors"
        :class="mode === option.value
          ? 'bg-accent-700 text-white dark:bg-accent-400 dark:text-accent-950'
          : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'"
        @click.stop="mode = option.value">{{ option.text }}</button>
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

const nodeWidth = 216
const fontSize = 13
const lineHeight = 17
const paddingY = 10
const maxLines = 3
const horizontalGap = 56
const verticalGap = 12
const textUnitsPerLine = 13

const container = ref(null)
const size = reactive({ width: 0, height: 0 })
const view = reactive({ x: 0, y: 0, scale: 1 })
const panning = ref(false)
const mode = ref('tree')
const modeOptions = [
  { value: 'tree', text: '树', label: '展开树模式' },
  { value: 'graph', text: '图', label: '有向图模式' }
]

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
    height: paddingY * 2 + lines.length * lineHeight,
    selected: String(raw.id) === String(props.selectedTaskId)
  }
}

// 展开树：子节点纵向排开，父节点对齐子节点跨度中心
const treeLayout = computed(() => {
  const nodes = []
  const edges = []
  let cursorY = 0

  const place = (raw, depth) => {
    const node = {
      ...measureNode(raw),
      x: depth * (nodeWidth + horizontalGap),
      y: 0
    }

    const children = Array.isArray(raw.children) ? raw.children : []
    if (children.length === 0) {
      node.y = cursorY
      cursorY += node.height + verticalGap
    } else {
      const placedChildren = children.map((child) => place(child, depth + 1))
      const first = placedChildren[0]
      const last = placedChildren[placedChildren.length - 1]
      node.y = (first.y + last.y + last.height - node.height) / 2

      const startY = node.y + node.height / 2
      const startX = node.x + nodeWidth
      placedChildren.forEach((child, index) => {
        const endY = child.y + child.height / 2
        const endX = child.x
        const bend = Math.max(24, (endX - startX) * 0.5)
        edges.push({
          key: `${node.id}->${child.id}-${index}`,
          isRef: !!child.isRef,
          d: `M${startX} ${startY} C${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`
        })
      })
    }

    nodes.push(node)
    return node
  }

  ;(props.nodes || []).forEach((root) => place(root, 0))

  const contentWidth = nodes.reduce((max, node) => Math.max(max, node.x + nodeWidth), 0)
  const contentHeight = Math.max(cursorY - verticalGap, 0)

  return { nodes, edges, contentWidth, contentHeight }
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

// 有向图：按强连通分量分层，环内节点顺序排列，回边从右侧绕回
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

  // 环内节点按顺序占一层，让环方向仍然从左到右可读
  const nodeLayer = new Map()
  components.forEach((component, index) => {
    const ordered = [...component].sort((a, b) => {
      const diff = Number(a) - Number(b)
      return Number.isFinite(diff) && diff !== 0 ? diff : String(a).localeCompare(String(b))
    })
    ordered.forEach((id, offset) => nodeLayer.set(id, componentLayer[index] + offset))
  })

  // 每层纵向堆叠，再整体垂直居中
  const layers = new Map()
  nodes.forEach((node) => {
    const layer = nodeLayer.get(node.id) ?? 0
    if (!layers.has(layer)) layers.set(layer, [])
    layers.get(layer).push(node)
  })

  const layerKeys = [...layers.keys()].sort((a, b) => a - b)
  const columnHeights = new Map()
  let maxHeight = 0

  layerKeys.forEach((layer) => {
    const column = layers.get(layer).sort((a, b) => {
      const diff = Number(a.id) - Number(b.id)
      return Number.isFinite(diff) && diff !== 0 ? diff : String(a.id).localeCompare(String(b.id))
    })
    let cursorY = 0
    column.forEach((node) => {
      node.x = layer * (nodeWidth + horizontalGap)
      node.y = cursorY
      cursorY += node.height + verticalGap
    })
    const columnHeight = Math.max(cursorY - verticalGap, 0)
    columnHeights.set(layer, columnHeight)
    maxHeight = Math.max(maxHeight, columnHeight)
  })

  layerKeys.forEach((layer) => {
    const offset = (maxHeight - columnHeights.get(layer)) / 2
    layers.get(layer).forEach((node) => { node.y += offset })
  })

  const routedEdges = rawEdges.map((edge, index) => {
    const from = byId.get(edge.from)
    const to = byId.get(edge.to)
    if (!from || !to) return null

    const backward = (nodeLayer.get(to.id) ?? 0) <= (nodeLayer.get(from.id) ?? 0)
    const startY = from.y + from.height / 2
    const startX = from.x + nodeWidth
    let path

    if (from.id === to.id) {
      // 自环：节点上方向外绕一圈
      path = `M${from.x + nodeWidth * 0.35} ${from.y} C${from.x + nodeWidth * 0.2} ${from.y - 44}, ${from.x + nodeWidth * 0.8} ${from.y - 44}, ${from.x + nodeWidth * 0.65} ${from.y}`
    } else if (backward) {
      // 回边：从右侧绕回目标右侧，提示环或逆向引用
      const endY = to.y + to.height / 2
      const endX = to.x + nodeWidth
      path = `M${startX} ${startY} C${startX + 70} ${startY}, ${endX + 70} ${endY}, ${endX} ${endY}`
    } else {
      const endY = to.y + to.height / 2
      const endX = to.x
      const bend = Math.max(24, (endX - startX) * 0.5)
      path = `M${startX} ${startY} C${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`
    }

    return { key: `${edge.from}->${edge.to}-${index}`, isRef: edge.isRef || backward, d: path }
  }).filter(Boolean)

  const contentWidth = nodes.reduce((max, node) => Math.max(max, node.x + nodeWidth), 0)

  return { nodes, edges: routedEdges, contentWidth, contentHeight: maxHeight }
})

const layout = computed(() => (mode.value === 'tree' ? treeLayout.value : graphLayout.value))

const idSignature = computed(() => `${mode.value}:${layout.value.nodes.map((node) => node.id).join('|')}`)

let hasInteracted = false

const fitView = () => {
  const el = container.value
  if (!el) return
  const { contentWidth, contentHeight } = layout.value
  if (!contentWidth || !size.width || !size.height) return

  const pad = 40
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

// 任务增删后重新适配视图；仅标题变化时保持当前缩放与位置
watch(idSignature, () => nextTick(fitView))
</script>

<style scoped>
.mindmap-canvas {
  background-color: #fafafa;
}

@media (prefers-color-scheme: dark) {
  .mindmap-canvas {
    background-color: #141414;
  }
}
</style>
