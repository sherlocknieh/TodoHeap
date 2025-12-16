<template>
  <div ref="mindMapContainer"
    class="flex flex-col flex-1 min-h-[300px] w-full max-h-full relative overflow-hidden bg-linear-to-br from-white to-gray-50 border border-gray-200 rounded-xl shadow-md">
  </div>
</template>

<script setup>
import { onMounted, ref, computed, watch, nextTick } from 'vue'
import MindMap from 'simple-mind-map'

const props = defineProps({
  todos: { type: Array, default: () => [] },
  title: { type: String, default: 'Todo 思维导图' },
  selectedTaskId: { type: Number, default: null },
  mindData: { type: Object, default: null }
})

const mindMapContainer = ref(null)
let mindMapInstance = null
const layoutMode = ref('logicalStructure')

const mindMapData = computed(() => {
  // 如果外部传入了完整数据，优先使用
  if (props.mindData) return props.mindData

  const todosArray = props.todos || []
  if (todosArray.length === 0) {
    return {
      data: { text: props.title },
      children: []
    }
  }

  const buildNode = (todo) => ({
    data: {
      text: todo.title || '未命名任务',
      status: todo.status || 'todo',
      id: todo.id
    },
    children: []
  })

  const nodes = todosArray.map(buildNode)
  const map = new Map()
  todosArray.forEach((todo, idx) => map.set(todo.id, nodes[idx]))

  const roots = []
  todosArray.forEach((todo, idx) => {
    const node = nodes[idx]
    if (todo.parent_id && map.has(todo.parent_id)) {
      map.get(todo.parent_id).children.push(node)
    } else {
      roots.push(node)
    }
  })

  return {
    data: { text: props.title },
    children: roots
  }
})

const initMindMap = async () => {
  if (!mindMapContainer.value) return

  if (mindMapInstance) {
    try {
      mindMapInstance.destroy?.()
    } catch (e) {
      console.error('Error destroying previous instance:', e)
    }
    mindMapInstance = null
  }

  await nextTick()

  try {
    const rect = mindMapContainer.value.getBoundingClientRect()
    if (rect.height <= 0) {
      console.error('Container height is 0 or negative! This will prevent rendering.')
    }

    mindMapInstance = new MindMap({
      el: mindMapContainer.value,
      data: mindMapData.value,
      layout: layoutMode.value,
      theme: 'default',
      readonly: false,
      alwaysShowExpandBtn: false,
      expandBtnSize: 20,
      hoverRectColor: 'rgb(94, 200, 248)',
      hoverRectPadding: 2,
      fit: false,
      fitPadding: 0,
      isDisableDrag: false,
      disableMouseWheelZoom: false,
      enableCtrlKeyNodeSelection: true,
      nodeTextEditZindex: 1000
    })

    // 尝试立即调整到可见范围
    if (mindMapInstance?.view?.fit) {
      try { mindMapInstance.view.fit() } catch (e) { /* ignore */ }
    }

    mindMapInstance.on('node_tree_render_end', () => {
      if (mindMapInstance?.view?.fit) {
        try { mindMapInstance.view.fit() } catch (e) { /* ignore */ }
      }
    })

    mindMapInstance.on('node_content_change', (node) => {
      const nodeData = node.getData()
      const text = nodeData?.text || ''
      const nodeId = nodeData?.id
      emit('node-content-change', { id: nodeId, text })
    })

    mindMapInstance.on('node_insert', (node) => {
      const nodeData = node.getData()
      const text = nodeData?.text || ''
      if (!text || text === props.title) return
      const parentNode = node.parent
      if (!parentNode) return
      const parentNodeData = parentNode.getData()
      const parentId = parentNodeData?.id
      emit('node-insert', { text, parentId })
    })

    mindMapInstance.on('node_click', (node) => {
      const nodeData = node.getData()
      const text = nodeData?.text || ''
      const nodeId = nodeData?.id
      if (nodeId) emit('task-selected', nodeId)
      emit('node-click', { id: nodeId, text })
    })
  } catch (error) {
    console.error('Failed to initialize MindMap:', error)
  }
}

// 当 todos 或 外部 mindData 发生变化时重新初始化
watch(
  [() => props.todos, () => props.mindData],
  async () => {
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 100))
    initMindMap()
  },
  { deep: true }
)

onMounted(async () => {
  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 200))
  initMindMap()
})
</script>
