<template>
  <!-- 思维导图容器 -->
  <div ref="mindMapContainer" class="min-h-100 w-full border border-gray-300 rounded-lg relative">
    <!-- 控件层 -->
    <div class="absolute top-4 right-4 z-10 flex flex-col gap-2">
      <button
        @click="centerView"
        class="bg-white border border-gray-300 rounded-md p-2 shadow-sm hover:bg-gray-50 transition-colors"
        title="居中视图"
      >
        🎯
      </button>
      <button
        @click="leftView"
        class="bg-white border border-gray-300 rounded-md p-2 shadow-sm hover:bg-gray-50 transition-colors"
        title="居左视图"
      >
        ⬅️
      </button>
      <button
        @click="zoomIn"
        class="bg-white border border-gray-300 rounded-md p-2 shadow-sm hover:bg-gray-50 transition-colors"
        title="放大"
      >
        ➕
      </button>
      <button
        @click="zoomOut"
        class="bg-white border border-gray-300 rounded-md p-2 shadow-sm hover:bg-gray-50 transition-colors"
        title="缩小"
      >
        ➖
      </button>
      <button
        @click="fitView"
        class="bg-white border border-gray-300 rounded-md p-2 shadow-sm hover:bg-gray-50 transition-colors"
        title="适应视图"
      >
        📐
      </button>
    </div>
  </div>
</template>

<script setup>

import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import MindMap from 'simple-mind-map'


const props = defineProps({
  mindData: { type: Object, default: () => ({ data: { text: '根节点' }, children: [] }) },
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
    mindMapInstance.on('insert', (payload) => {
      console.log('[MindMap DEBUG] insert event payload:', JSON.stringify(payload, null, 2))
      emit('node-insert', payload)
    })
    mindMapInstance.on('delete', (payload) => {
      console.log('[MindMap DEBUG] delete event payload:', JSON.stringify(payload, null, 2))
      emit('node-delete', payload)
    })
    mindMapInstance.on('data_change', (data) => {
      console.log('[MindMap DEBUG] data_change event triggered')
      emit('data-change', data)
    })
    mindMapInstance.on('data_change_detail', (details) => {
      console.log('[MindMap DEBUG] data_change_detail event:', JSON.stringify(details, null, 2))
      emit('data-change-detail', details)
    })
    mindMapInstance.on('node_active', (node, activeNodeList) => {
      // 总是通过 activeNodeList 的状态来判断
      if (activeNodeList.length === 0) {
        console.log('没有激活的节点')
        // 取消选中
        emit('task-selected', null)
        if (typeof hideNodeToolbar === 'function') hideNodeToolbar()
      } else {
        console.log('有', activeNodeList.length, '个激活的节点')
        // 打印节点uid列表
        const uids = activeNodeList.map(n => n.getData ? n.getData('uid') : n?.data?.uid)
        console.log('激活节点 UID 列表:', uids)
        // 选中节点uid对应的任务
        const activeNode = activeNodeList[0]
        const nodeUid = activeNode.getData ? activeNode.getData('uid') : activeNode?.data?.uid
        emit('task-selected', nodeUid ? parseInt(nodeUid) : null)
      }
    })
  }

  // 初次挂载后自动居中
  setTimeout(() => {
    console.log('[MindMap DEBUG] Initial moveToCenter called')
    moveToCenter()
  }, 0)

  // 每次节点树渲染后自动居中 - 这会导致视角重置问题！
  mindMapInstance.on('node_tree_render_end', () => {
    console.log('[MindMap DEBUG] node_tree_render_end event - moveToCenter called (问题根源!)')
    moveToCenter()
    // 渲染完成后，如果有选中的任务，选中对应节点
    if (props.selectedTaskId) {
      const nodeUid = props.selectedTaskId.toString()
      const node = mindMapInstance.renderer.findNodeByUid(nodeUid)
      if (node) {
        node.active()
        console.warn('Node tree render end selectedTaskId:', props.selectedTaskId, 'Node found and activated')
      }
    }
  })
}

// 生命周期 & 数据同步
onMounted(() => initMindMap())

// 监听 selectedTaskId 变化，选中对应节点
watch(() => props.selectedTaskId, (newId) => {
  if (!mindMapInstance || !newId) return
  const nodeUid = newId.toString()
  const node = mindMapInstance.renderer.findNodeByUid(nodeUid)
  console.warn('Watch selectedTaskId:', newId, 'Found node:', node)
  if (node) {
    node.active()
  }
})

// 监听 mindData 变化，更新实例
watch(() => props.mindData, (newVal, oldVal) => {
  console.log('[MindMap DEBUG] mindData watch triggered')
  console.log('[MindMap DEBUG] Old nodes count:', oldVal?.children?.length || 0)
  console.log('[MindMap DEBUG] New nodes count:', newVal?.children?.length || 0)
  if (!mindMapInstance) return initMindMap()
  if (mindMapInstance.setData) {
    console.log('[MindMap DEBUG] Calling setData() - this triggers full re-render!')
    mindMapInstance.setData(newVal)
  } else {
    initMindMap()
  }
  // 数据更新后，如果有选中的任务，选中对应节点
  setTimeout(() => {
    if (props.selectedTaskId) {
      const nodeUid = props.selectedTaskId.toString()
      const node = mindMapInstance.renderer.findNodeByUid(nodeUid)
      if (node) {
        node.active()
      }
    }
  }, 100) // 延迟一点时间，确保渲染完成
}, { deep: true })

// 控件方法
const centerView = () => {
  if (!mindMapInstance) return
  moveToCenter()
}

const zoomIn = () => {
  if (!mindMapInstance) return
  mindMapInstance.view.scale(1.2)
}

const zoomOut = () => {
  if (!mindMapInstance) return
  mindMapInstance.view.scale(0.8)
}

const fitView = () => {
  if (!mindMapInstance) return
  mindMapInstance.view.fit()
}
</script>
