<template>
  <div ref="mindMapContainer" class="min-h-100 w-full border border-gray-300 rounded-lg"></div>
</template>

<script setup>
/**
 * MindMapWrapper 组件
 * 目的：接受父组件传入的 `mindData`，并将其交给第三方库 `simple-mind-map` 渲染。
 *
 * 设计要点（说明）：
 * - `mindData` 是 simple-mind-map 使用的数据结构，形如 { data: { text }, children: [...] }。
 * - 组件在挂载时使用 `initMindMap()` 创建实例；若外部数据发生变化，优先调用
 *   实例的 `setData(newVal)`（若该方法存在），否则回退为重建实例以确保可见变化。
 * - 为避免内存泄漏与重复事件绑定，创建新实例前会尝试销毁已有实例（如果库暴露了 `destroy()`）。
 * - 将库的常见事件（`select`、`change`、`insert`）通过 `emit` 转发给父组件，父组件可监听并处理持久化。
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

// 组件向外触发的事件，父组件可监听：
// - 'task-selected' (id)       选中某个节点时返回该节点对应的任务 id
// - 'node-content-change' ({id, text}) 编辑节点后通知父组件保存
// - 'node-insert' (payload)    在导图上插入新节点时触发
const emit = defineEmits(['task-selected', 'node-content-change', 'node-insert'])

// ----------------------------- 本地变量 -----------------------------
// DOM 容器引用，传给第三方库作为挂载点（注意：传入真实 DOM 节点）
const mindMapContainer = ref(null)

// 存放 simple-mind-map 实例引用，用于后续更新或销毁
let mindMapInstance = null

// ----------------------------- 初始化 / 事件绑定 -----------------------------
/**
 * 初始化或重建思维导图实例。
 * 步骤：
 *  1. 如果已有实例，且存在 destroy() 方法，先尝试调用以清理资源和解绑事件；
 *  2. 使用当前 props.mindData 创建新实例；
 *  3. 如果实例支持事件注册（如 on），绑定 select/change/insert 等事件并通过 emit 转发。
 */
const initMindMap = () => {
  if (!mindMapContainer.value) return

  // 如果已存在实例，优雅销毁（如果暴露 destroy）
  if (mindMapInstance && mindMapInstance.destroy) {
    try {
      mindMapInstance.destroy()
    } catch (e) {
      // 忽略销毁过程中的异常，继续重建新实例
    }
    mindMapInstance = null
  }

  // 创建新实例：注意这里传入的是 DOM 节点（mindMapContainer.value）
  mindMapInstance = new MindMap({ el: mindMapContainer.value, data: props.mindData })

  // 绑定事件（若第三方库提供事件接口）并转发为组件事件
  if (mindMapInstance && mindMapInstance.on) {
    // 当用户在导图上选中一个节点时，向父组件传递该节点 data 中的 id（若存在）
    mindMapInstance.on('select', (node) => {
      emit('task-selected', node?.data?.id ?? null)
    })

    // 节点内容变更（例如编辑节点文本时）
    mindMapInstance.on('change', ({ id, text } = {}) => {
      emit('node-content-change', { id, text })
    })

    // 插入节点时触发（payload 结构依赖库实现）
    mindMapInstance.on('insert', (payload) => emit('node-insert', payload))
  }
}

// ----------------------------- 生命周期 & 数据同步 -----------------------------
// 组件挂载后立即初始化导图实例
onMounted(() => initMindMap())

/**
 * 监听外部传入的 mindData：
 * - 若实例提供 `setData` 方法，则直接调用以便更高效更新；
 * - 否则使用回退策略：重建实例（initMindMap）。
 * - 使用 deep: true 以便监听嵌套属性的变化。
 */
watch(() => props.mindData, (newVal) => {
  if (!mindMapInstance) return initMindMap()
  if (mindMapInstance.setData) {
    mindMapInstance.setData(newVal)
  } else {
    // 若库没有提供更新接口，则重建实例
    initMindMap()
  }
}, { deep: true })

// 组件卸载时清理实例（避免内存泄露）
onBeforeUnmount(() => {
  if (mindMapInstance && mindMapInstance.destroy) mindMapInstance.destroy()
})
</script>
