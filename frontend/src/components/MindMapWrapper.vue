<template>
  <!-- 思维导图容器 -->
  <div ref="mindMapContainer" class="min-h-100 h-full w-full border border-gray-300 rounded-lg relative" @click.stop>
    <!-- 控件层 -->
    <div class="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
      <button
        @click="fitView"
        class="bg-white border border-gray-300 rounded-md p-2 shadow-sm hover:bg-gray-50 transition-colors"
        title="适应视图"
      >
        🔄️
      </button>
    </div>
  </div>
</template>

<script setup>

import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import MindMap from 'simple-mind-map'


const props = defineProps({
  mindData: { type: Object, default: () => ({ data: { text: '根节点' }, children: [] }) },
  selectedTaskId: { type: Number, default: null }
})

// 标记是否由内部操作引起的变化（避免反向同步循环）
let isInternalChange = false

// 组件事件：task-selected, node-content-change, node-insert, node-delete, data-change, data-change-detail
const emit = defineEmits(['task-selected', 'node-content-change', 'node-insert', 'node-delete', 'data-change', 'data-change-detail'])

// 本地变量
const mindMapContainer = ref(null) // DOM 容器
let mindMapInstance = null // 思维导图实例
let isUpdatingData = false // 标志位：是否正在更新数据（用于防止闪烁）

// 居中思维导图视图
const moveToCenter = () => {
  if (!mindMapInstance || !mindMapInstance.renderer.root) return
  const containerDiv = mindMapContainer.value
  if (!containerDiv) return // 容器还未准备好
  
  const root = mindMapInstance.renderer.root
  const children = root.children || []
  const rootRight = root.left + root.width
  const firstLeft = children.length > 0 ? children[0].left : root.left
  const centerX = (rootRight + firstLeft) / 2
  const centerY = (root.top + root.height / 2)
  const transform = mindMapInstance.draw.transform()
  const forkViewX = centerX * transform.scaleX + transform.translateX
  const forkViewY = centerY * transform.scaleY + transform.translateY
  const width = containerDiv.clientWidth
  const height = containerDiv.clientHeight
  const canvasCenterX = width / 2
  const canvasCenterY = height / 2
  const relX = forkViewX - canvasCenterX
  const relY = forkViewY - canvasCenterY
  mindMapInstance.view.translateXY(-relX, -relY)
}

const fitView = () => {
  if (!mindMapInstance) return
  mindMapInstance.view.fit()
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
      // 如果正在更新数据，忽略此事件以防止闪烁
      if (isUpdatingData) {
        console.log('正在更新数据，忽略 node_active 事件')
        return
      }
      
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

  // 节点树渲染完成事件
  mindMapInstance.on('node_tree_render_end', () => {
    // 渲染完成后，如果有选中的任务，选中对应节点
    if (props.selectedTaskId) {
      const nodeUid = props.selectedTaskId.toString()
      const node = mindMapInstance.renderer.findNodeByUid(nodeUid)
      if (node) {
        node.active()
      }
    }
    // 渲染完成后调用 fitView，确保节点已渲染且布局已计算
    fitView()
  })
  
  // 监听内部数据变化，标记为内部操作
  mindMapInstance.on('data_change', () => {
    isInternalChange = true
    // 下一个 tick 重置标记
    setTimeout(() => {
      isInternalChange = false
    }, 100)
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

// 只在非内部变化且未初始化时才重新设置数据
watch(() => props.mindData, (newVal, oldVal) => {
  // 如果是内部操作引起的变化，跳过（避免循环）
  if (isInternalChange) {
    return
  }
  
  // 如果实例不存在，初始化
  if (!mindMapInstance) {
    return initMindMap()
  }
  
  // 如果已初始化，只在首次加载数据时同步（避免反向同步导致的闪烁）
  // 通过比较节点数量变化来判断是否需要同步
  const oldCount = oldVal?.children?.length || 0
  const newCount = newVal?.children?.length || 0
  
  // 尝试使用 updateData 代替 setData 以避免全量重绘和视图重置
  if (oldCount === 0 && newCount > 0) {
    // 记录当前视图状态（位置、缩放）
    const viewTransform = mindMapInstance.view.getTransformData()
    
    if (mindMapInstance.updateData) {
      mindMapInstance.updateData(newVal)
    } else {
      mindMapInstance.setData(newVal)
    }
    
    // 恢复视图状态，防止视图重置
    if (viewTransform) {
       mindMapInstance.view.setTransformData(viewTransform)
    }
  }
  // 其他情况：数据变化由 MindMap 内部操作触发，
  // MindMap 已经更新了视图，无需再次 setData

}, { deep: true })
</script>