<template>
  <div class="trash-container" ref="trashContainerRef">
    <!-- 头部 -->
    <header class="trash-header">
      <div class="header-info">
        <h2>🗑️ 垃圾箱</h2>
        <p>{{ trashTodos.length }} 个已删除任务</p>
      </div>
      <div class="header-actions">
        <button
          v-if="trashTodos.length > 0"
          class="btn btn-secondary"
          @click="handleRestoreAll"
        >
          ↩️ 恢复全部
        </button>
        <button
          v-if="trashTodos.length > 0"
          class="btn btn-danger"
          @click="handleEmptyTrash"
        >
          🗑️ 清空垃圾箱
        </button>
      </div>
    </header>

    <!-- 加载状态 -->
    <div v-if="trashLoading" class="loading-state">
      <div class="spinner">⏳</div>
      <p>加载中...</p>
    </div>

    <!-- 空状态 -->
    <div v-else-if="trashTodos.length === 0" class="empty-state">
      <div class="empty-icon">🎉</div>
      <p class="empty-title">垃圾箱是空的</p>
      <p class="empty-desc">删除的任务会显示在这里</p>
    </div>


    <!-- 树形任务列表 -->
    <ul v-else class="list-none p-0 m-0 flex-1 overflow-y-auto">
      <template v-for="item in flatTrashList" :key="item.id">
        <li v-if="shouldShowItem(item)"
          :class="[
            'flex items-center gap-2.5 p-2.5 px-3 bg-white border-b border-slate-100 transition-colors duration-150 cursor-pointer',
            {
              'bg-blue-50 border-l-3 border-l-blue-600': selectedTaskId === item.id,
              'opacity-60': true
            }
          ]"
          :style="{ paddingLeft: (12 + item._level * 20) + 'px' }"
          @click="selectTask(item.id)"
        >
          <!-- 展开/折叠按钮 -->
          <div class="flex items-center mr-1 w-6 justify-center">
            <button v-if="item.children && item.children.length"
              class="inline-flex items-center justify-center w-5 h-5 border-none bg-transparent rounded cursor-pointer transition-colors duration-150 text-slate-500 hover:bg-slate-200"
              @click.stop="toggleExpand(item.id)"
            >
              <svg v-if="expandedMap[item.id]" class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>
              <svg v-else class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            <span v-else class="inline-block w-4 h-4"></span>
          </div>

          <!-- 删除标记图标 -->
          <div class="shrink-0">
            <div class="inline-flex items-center justify-center w-4 h-4 rounded border bg-slate-100 border-slate-300 text-slate-400">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          </div>

          <!-- 标题 -->
          <div class="flex-1 min-w-0">
            <span class="block text-sm text-slate-500 font-normal leading-relaxed wrap-break-word line-through">
              {{ item.title || '未命名任务' }}
            </span>
            <span v-if="item.children && item.children.length" class="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full ml-2">
              {{ item.children.length }} 个子任务
            </span>
          </div>

          <!-- 元信息 -->
          <div class="flex items-center gap-2 shrink-0">
            <span class="text-xs text-slate-400 px-2 py-0.5 bg-slate-100 rounded">
              删除于 {{ formatDate(item.deleted_at) }}
            </span>
            <span v-if="item.priority > 0" :class="[
              'text-xs font-semibold px-1.5 py-0.5 rounded',
              {
                'bg-amber-100 text-amber-800': item.priority === 1,
                'bg-orange-100 text-orange-800': item.priority === 2,
                'bg-red-100 text-red-800': item.priority === 3
              }
            ]">
              P{{ item.priority }}
            </span>
          </div>

          <!-- 操作按钮组 -->
          <div class="flex items-center gap-1 shrink-0 opacity-0 hover-show transition-opacity duration-150">
            <button
              class="inline-flex items-center justify-center w-7 h-7 border-none bg-transparent rounded cursor-pointer transition-colors duration-150 text-slate-500 hover:bg-green-100 hover:text-green-600"
              @click.stop="handleRestoreWithCheck(item.id)"
              title="恢复任务"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button
              class="inline-flex items-center justify-center w-7 h-7 border-none bg-transparent rounded cursor-pointer transition-colors duration-150 text-slate-500 hover:bg-red-100 hover:text-red-600"
              @click.stop="handlePermanentDelete(item.id)"
              title="永久删除"
            >
              <span class="text-lg leading-none font-light">×</span>
            </button>
          </div>
        </li>
      </template>

    </ul>

    <!-- 确认弹窗 -->
    <Transition name="modal">
      <div v-if="showConfirmModal" class="modal-overlay" @click.self="closeConfirmModal">
        <div class="modal-content">
          <h3>{{ confirmTitle }}</h3>
          <p>{{ confirmMessage }}</p>
          <p v-if="confirmSubMessage" class="modal-sub-message">{{ confirmSubMessage }}</p>
          <div class="modal-actions">
            <button class="btn btn-secondary" @click="closeConfirmModal">取消</button>
            <button :class="['btn', confirmButtonClass]" @click="confirmAction">{{ confirmButtonText }}</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 恢复限制提示弹窗 -->
    <Transition name="modal">
      <div v-if="showRestoreBlockedModal" class="modal-overlay" @click.self="closeRestoreBlockedModal">
        <div class="modal-content modal-warning">
          <h3>⚠️ 无法恢复</h3>
          <p>{{ restoreBlockedMessage }}</p>
          <div class="modal-actions">
            <button class="btn btn-secondary" @click="closeRestoreBlockedModal">知道了</button>
            <button v-if="blockedParentId" class="btn btn-primary" @click="handleRestoreParentInstead">
              恢复父任务「{{ blockedParentTitle }}」
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useTodoStore } from '../../stores/todos'

const props = defineProps({
  selectedTaskId: {
    type: Number,
    default: null
  }
})

const emit = defineEmits(['task-selected'])

// 点击空白区域处理
const trashContainerRef = ref(null)

const outsideClickHandler = (e) => {
	const el = trashContainerRef.value
	if (!el) return

	// 如果点击发生在垃圾箱容器内部但不在任务项上，则取消选中
	if (el.contains(e.target)) {
		// 如果当前没有选中任务，则不需要处理
		if (props.selectedTaskId == null) return

		// 如果点击落在某个任务项内部，则不取消选中
		const taskItem = e.target.closest && e.target.closest('li')
		if (!taskItem) {
			emit('task-selected', null)
		}
	}
}

onMounted(() => {
	document.addEventListener('click', outsideClickHandler)
})

onUnmounted(() => {
	document.removeEventListener('click', outsideClickHandler)
})

const todoStore = useTodoStore()

const trashTodos = computed(() => todoStore.trashTodos)
const trashTreeNodes = computed(() => todoStore.trashTreeNodes)
const trashLoading = computed(() => todoStore.trashLoading)

// 检查父任务是否在垃圾箱中
function isParentInTrash(parentId) {
  if (!parentId) return false
  return trashTodos.value.some(t => t.id === parentId)
}

// 展平树结构为带层级的数组
function flattenTree(nodes, level = 0, arr = []) {
  if (!nodes || !nodes.length) return arr
  nodes.forEach(node => {
    arr.push({ ...node, _level: level })
    if (node.children && node.children.length) {
      flattenTree(node.children, level + 1, arr)
    }
  })
  return arr
}

const flatTrashList = computed(() => flattenTree(trashTreeNodes.value))

// 判断任务是否应该显示
function shouldShowItem(item) {
  // 如果没有父任务，显示
  if (!item.parent_id) return true
  
  // 如果父任务不在垃圾箱中（父任务未被删除），作为根节点显示
  if (!isParentInTrash(item.parent_id)) return true
  
  // 如果父任务在垃圾箱中，根据展开状态决定是否显示
  // 默认为展开状态（expandedMap中不存在时视为true）
  return expandedMap.value[item.parent_id] !== false
}

// 展开/折叠状态
const expandedMap = ref({})

// 初始化所有节点为展开状态
onMounted(() => {
  flatTrashList.value.forEach(item => {
    if (item.children && item.children.length) {
      expandedMap.value[item.id] = true
    }
  })
})

const toggleExpand = (id) => {
  expandedMap.value[id] = !expandedMap.value[id]
}

// 格式化日期
function formatDate(dateStr) {
  if (!dateStr) return '未知'
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now - date
  
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))} 分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))} 小时前`
  if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / (24 * 60 * 60 * 1000))} 天前`
  return date.toLocaleDateString('zh-CN')
}

// 确认弹窗状态
const showConfirmModal = ref(false)
const confirmTitle = ref('')
const confirmMessage = ref('')
const confirmSubMessage = ref('')
const confirmButtonText = ref('确认')
const confirmButtonClass = ref('btn-danger')
const pendingAction = ref(null)

// 恢复限制提示弹窗状态
const showRestoreBlockedModal = ref(false)
const restoreBlockedMessage = ref('')
const blockedParentId = ref(null)
const blockedParentTitle = ref('')

onMounted(async () => {
  await todoStore.fetchTrash()
})

// 选择任务
function selectTask(id) {
  emit('task-selected', id)
}

// 恢复任务（带检查）
function handleRestoreWithCheck(id) {
  const checkResult = todoStore.canRestoreTodo(id)
  
  if (!checkResult.canRestore) {
    // 显示恢复限制提示弹窗
    restoreBlockedMessage.value = checkResult.reason
    blockedParentId.value = checkResult.parentId || null
    blockedParentTitle.value = checkResult.parentTitle || ''
    showRestoreBlockedModal.value = true
    return
  }
  
  // 可以恢复，检查是否有子任务
  const restoreCount = todoStore.countRestoreTodos(id)
  const todo = trashTodos.value.find(t => t.id === id)
  
  if (restoreCount > 1) {
    // 有子任务，显示确认弹窗
    confirmTitle.value = '恢复任务'
    confirmMessage.value = `确定要恢复「${todo?.title || '未命名任务'}」吗？`
    confirmSubMessage.value = `将同时恢复 ${restoreCount - 1} 个子任务`
    confirmButtonText.value = '恢复'
    confirmButtonClass.value = 'btn-primary'
    pendingAction.value = async () => {
      const result = await todoStore.restoreTodo(id)
      if (!result.success) {
        alert('恢复失败：' + result.error)
      }
    }
    showConfirmModal.value = true
  } else {
    // 没有子任务，直接恢复
    handleRestore(id)
  }
}

// 恢复单个任务
async function handleRestore(id) {
  const result = await todoStore.restoreTodo(id)
  if (!result.success) {
    alert('恢复失败：' + result.error)
  }
}

// 恢复父任务（从限制提示弹窗触发）
function handleRestoreParentInstead() {
  closeRestoreBlockedModal()
  if (blockedParentId.value) {
    handleRestoreWithCheck(blockedParentId.value)
  }
}

// 关闭恢复限制提示弹窗
function closeRestoreBlockedModal() {
  showRestoreBlockedModal.value = false
  restoreBlockedMessage.value = ''
  blockedParentId.value = null
  blockedParentTitle.value = ''
}

// 永久删除单个任务
function handlePermanentDelete(id) {
  const todo = trashTodos.value.find(t => t.id === id)
  const descendantCount = todoStore.findTrashDescendantIds(id).length
  
  confirmTitle.value = '永久删除'
  confirmMessage.value = `此操作不可恢复，确定要永久删除「${todo?.title || '未命名任务'}」吗？`
  confirmSubMessage.value = descendantCount > 0 ? `将同时删除 ${descendantCount} 个子任务` : ''
  confirmButtonText.value = '删除'
  confirmButtonClass.value = 'btn-danger'
  pendingAction.value = async () => {
    const result = await todoStore.permanentDeleteTodo(id)
    if (!result.success) {
      alert('删除失败：' + result.error)
    }
  }
  showConfirmModal.value = true
}

// 恢复全部
function handleRestoreAll() {
  confirmTitle.value = '恢复全部'
  confirmMessage.value = `确定要恢复垃圾箱中的 ${trashTodos.value.length} 个任务吗？`
  confirmSubMessage.value = ''
  confirmButtonText.value = '恢复全部'
  confirmButtonClass.value = 'btn-primary'
  pendingAction.value = async () => {
    const result = await todoStore.restoreAllTrash()
    if (!result.success) {
      alert('恢复失败：' + result.error)
    }
  }
  showConfirmModal.value = true
}

// 清空垃圾箱
function handleEmptyTrash() {
  confirmTitle.value = '清空垃圾箱'
  confirmMessage.value = `此操作不可恢复，确定要永久删除 ${trashTodos.value.length} 个任务吗？`
  confirmSubMessage.value = ''
  confirmButtonText.value = '清空'
  confirmButtonClass.value = 'btn-danger'
  pendingAction.value = async () => {
    const result = await todoStore.emptyTrash()
    if (!result.success) {
      alert('清空失败：' + result.error)
    }
  }
  showConfirmModal.value = true
}

// 关闭确认弹窗
function closeConfirmModal() {
  showConfirmModal.value = false
  confirmSubMessage.value = ''
  pendingAction.value = null
}

// 执行确认操作
async function confirmAction() {
  if (pendingAction.value) {
    await pendingAction.value()
  }
  closeConfirmModal()
}
</script>

<style scoped>
.trash-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
}

.trash-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  background: white;
  border-bottom: 1px solid #f1f5f9;
}

.header-info h2 {
  margin: 0;
  font-size: 1.25rem;
  color: #1e293b;
}

.header-info p {
  margin: 0.25rem 0 0;
  font-size: 0.875rem;
  color: #64748b;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  border-radius: 0.5rem;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: #f1f5f9;
  color: #475569;
}

.btn-secondary:hover:not(:disabled) {
  background: #e2e8f0;
}

.btn-primary {
  background: #2563eb;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #1d4ed8;
}

.btn-danger {
  background: #fee2e2;
  color: #dc2626;
}

.btn-danger:hover:not(:disabled) {
  background: #fecaca;
}

.loading-state,
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
}

.spinner {
  font-size: 2rem;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.empty-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}

.empty-desc {
  font-size: 0.875rem;
  color: #64748b;
  margin: 0.5rem 0 0;
}

/* 悬停显示操作按钮 */
li:hover .hover-show {
  opacity: 1 !important;
}

/* 弹窗样式 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal-content {
  background: white;
  padding: 1.5rem;
  border-radius: 0.75rem;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
}

.modal-content h3 {
  margin: 0 0 0.5rem;
  font-size: 1.125rem;
  color: #1e293b;
}

.modal-content p {
  margin: 0 0 0.5rem;
  color: #64748b;
  font-size: 0.875rem;
}

.modal-sub-message {
  margin: 0 0 1rem !important;
  color: #94a3b8;
  font-size: 0.8rem;
}

.modal-content p:last-of-type {
  margin-bottom: 1.5rem;
}

.modal-warning h3 {
  color: #d97706;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

/* 弹窗动画 */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-content,
.modal-leave-active .modal-content {
  transition: transform 0.2s ease;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.95);
}

@media (max-width: 640px) {
  .header-actions {
    flex-direction: column;
    gap: 0.25rem;
  }

  .btn {
    padding: 0.375rem 0.75rem;
    font-size: 0.8rem;
  }
  
  li .hover-show {
    opacity: 1 !important;
  }
}
</style>
