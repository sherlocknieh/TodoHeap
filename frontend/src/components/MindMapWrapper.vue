<template>
  <div ref="mindMapContainer" class="min-h-100 w-full border border-gray-300 rounded-lg"></div>
</template>

<script setup>
/**
 * MindMapWrapper: 封装 simple-mind-map 库，接收 mindData 渲染思维导图，转发事件给父组件。
 */
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import MindMap from 'simple-mind-map'

// ----------------------------- Props & Emits -----------------------------
// 从父组件接收的 props
const props = defineProps({
  // 导图数据，必须与 simple-mind-map 要求的数据结构一致
  mindData: { type: Object, default: () => ({ data: { text: '' }, children: [] }) },
  // 以下为可选的上下文 prop，组件内部当前不直接使用，但保留以便父组件传参
  title: { type: String, default: '' },
  todos: { type: Array, default: () => [] },
  selectedTaskId: { type: Number, default: null }
})

// 组件事件：task-selected, node-content-change, node-insert, node-delete, data-change, data-change-detail
const emit = defineEmits(['task-selected', 'node-content-change', 'node-insert', 'node-delete', 'data-change', 'data-change-detail'])

// 本地变量
const mindMapContainer = ref(null) // DOM 容器
let mindMapInstance = null // 思维导图实例

// 居中思维导图视图
const moveToCenter = () => {
  if (!mindMapInstance || !mindMapInstance.renderer.root) return
  const root = mindMapInstance.renderer.root
  const children = root.children || []
  const rootRight = root.left + root.width
  const firstLeft = children.length > 0 ? children[0].left : root.left
  const centerX = (rootRight + firstLeft) / 2
  const centerY = (root.top + root.height / 2)
  const transform = mindMapInstance.draw.transform()
  const forkViewX = centerX * transform.scaleX + transform.translateX
  const forkViewY = centerY * transform.scaleY + transform.translateY
  const containerDiv = mindMapContainer.value
  const width = containerDiv.clientWidth
  const height = containerDiv.clientHeight
  const canvasCenterX = width / 2
  const canvasCenterY = height / 2
  const relX = forkViewX - canvasCenterX
  const relY = forkViewY - canvasCenterY
  mindMapInstance.view.translateXY(-relX, -relY)
  return { relX, relY, forkViewX, forkViewY }
}

// 初始化思维导图实例
const initMindMap = () => {
  if (!mindMapContainer.value) return

  // 销毁旧实例
  if (mindMapInstance && mindMapInstance.destroy) {
    try {
      mindMapInstance.destroy()
    } catch (e) {}
    mindMapInstance = null
  }

  // 创建新实例
  mindMapInstance = new MindMap({ el: mindMapContainer.value, data: props.mindData })

  // 绑定事件并转发
  if (mindMapInstance && mindMapInstance.on) {
    mindMapInstance.on('select', (node) => emit('task-selected', node?.data?.id ?? null))
    mindMapInstance.on('change', ({ id, text } = {}) => emit('node-content-change', { id, text }))
    mindMapInstance.on('insert', (payload) => emit('node-insert', payload))
    mindMapInstance.on('delete', (payload) => emit('node-delete', payload))
    mindMapInstance.on('data_change', (data) => emit('data-change', data))
    mindMapInstance.on('data_change_detail', (details) => emit('data-change-detail', details))
  }

  // 初次挂载后自动居中
  setTimeout(() => moveToCenter(), 0)

  // 每次节点树渲染后自动居中
  mindMapInstance.on('node_tree_render_end', () => {
    moveToCenter()
  })
}

// 生命周期 & 数据同步
onMounted(() => initMindMap())

// 监听 mindData 变化，更新实例
watch(() => props.mindData, (newVal) => {
  if (!mindMapInstance) return initMindMap()
  if (mindMapInstance.setData) {
    mindMapInstance.setData(newVal)
  } else {
    initMindMap()
  }
}, { deep: true })

// 卸载时清理实例
onBeforeUnmount(() => {
  if (mindMapInstance && mindMapInstance.destroy) mindMapInstance.destroy()
})
</script>
