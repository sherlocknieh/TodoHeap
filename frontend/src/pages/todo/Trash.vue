<template>
  <div class="h-full flex flex-col min-h-0" ref="trashContainerRef">
    <!-- 页面操作：已删除数量与恢复、清空入口放进主区域顶栏 -->
    <Teleport defer to="#main-topbar-actions">
      <p class="min-w-0 truncate whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">
        <span class="font-mono">{{ trashTodos.length }}</span> 个已删除任务
      </p>
      <div class="flex shrink-0 items-center gap-2">
        <!-- 选中任务时只针对该任务操作 -->
        <template v-if="props.selectedTaskId != null">
          <button class="btn-secondary" @click="handleRestoreWithCheck(props.selectedTaskId)">
            <AppIcon name="undo" :size="14" />
            <span>恢复</span>
          </button>
          <button class="btn-danger" @click="handlePermanentDelete(props.selectedTaskId)">
            <AppIcon name="trash" :size="14" />
            <span>永久删除</span>
          </button>
        </template>
        <!-- 否则为全局操作 -->
        <template v-else>
          <button v-if="trashTodos.length > 0" class="btn-secondary" @click="handleRestoreAll">
            <AppIcon name="undo" :size="14" />
            <span>恢复全部</span>
          </button>
          <button v-if="trashTodos.length > 0" class="btn-danger" @click="handleEmptyTrash">
            <AppIcon name="trash" :size="14" />
            <span>清空</span>
          </button>
        </template>
      </div>
    </Teleport>

    <!-- 加载中 -->
    <div v-if="trashLoading" class="flex-1 flex items-center justify-center gap-2 text-sm text-neutral-500">
      <AppIcon name="loader" :size="14" class="animate-spin" />
      <span>加载中…</span>
    </div>

    <!-- 空状态 -->
    <div v-else-if="trashTodos.length === 0" class="flex-1 flex flex-col items-center justify-center gap-1">
      <p class="text-sm text-neutral-500 dark:text-neutral-400">回收站是空的</p>
      <p class="text-xs text-neutral-400 dark:text-neutral-600">删除的任务会保留在这里</p>
    </div>

    <!-- 任务列表 -->
    <ul v-else ref="trashListRef" class="list-none flex-1 min-h-0 overflow-y-auto divide-y divide-hairline dark:divide-hairline-dark"
      @scroll.passive="saveTrashScroll">
      <template v-for="item in flatTrashList" :key="item.id">
        <li v-if="shouldShowItem(item)" :data-task-item="item.id" :data-task-id="item.id" :class="[
          'group flex items-center gap-2.5 rounded-md py-2.5 pr-3 cursor-pointer transition-colors',
          selectedTaskId === item.id
            ? 'bg-accent-100/70 dark:bg-accent-500/20'
            : 'hover:bg-neutral-100/80 dark:hover:bg-neutral-800/40'
        ]" :style="{ paddingLeft: (4 + item._level * 22) + 'px' }" @click="selectTask(item.id)">
          <!-- 展开/折叠 -->
          <button v-if="item.children && item.children.length"
            class="p-0.5 rounded text-neutral-400 hover:text-accent-800 dark:hover:text-accent-200 transition-colors"
            @click.stop="toggleExpand(item.id)">
            <AppIcon :name="expandedMap[item.id] ? 'chevronDown' : 'chevronRight'" :size="13" />
          </button>
          <span v-else class="w-[17px] shrink-0"></span>

          <AppIcon name="trash" :size="13" class="text-neutral-300 dark:text-neutral-700" />

          <!-- 标题 -->
          <div class="flex-1 min-w-0 flex items-baseline gap-2">
            <span class="text-sm text-neutral-400 dark:text-neutral-600 line-through truncate">
              {{ item.title || '未命名任务' }}
            </span>
            <span v-if="item.children && item.children.length" class="shrink-0 text-[11px] text-neutral-400 dark:text-neutral-600">
              {{ item.children.length }} 个子任务
            </span>
          </div>

          <!-- 元信息 -->
          <div class="flex items-center gap-2 shrink-0">
            <span class="font-mono text-[11px] text-neutral-400 dark:text-neutral-600">
              {{ formatDate(item.deleted_at) }}
            </span>
          </div>

          <!-- 行内操作 -->
          <div class="flex items-center gap-0.5 shrink-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button
              class="p-1 rounded text-neutral-400 hover:bg-accent-50 hover:text-accent-800 dark:hover:bg-accent-500/10 dark:hover:text-accent-200 transition-colors"
              @click.stop="handleRestoreWithCheck(item.id)" title="恢复任务">
              <AppIcon name="undo" :size="14" />
            </button>
            <button
              class="p-1 rounded text-neutral-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 transition-colors"
              @click.stop="handlePermanentDelete(item.id)" title="永久删除">
              <AppIcon name="close" :size="14" />
            </button>
          </div>
        </li>
      </template>
    </ul>

    <!-- 确认弹窗 -->
    <Transition name="modal">
      <div v-if="showConfirmModal" class="modal-overlay" @click.self="closeConfirmModal">
        <div class="panel modal-content">
          <h3 class="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{{ confirmTitle }}</h3>
          <p class="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">{{ confirmMessage }}</p>
          <p v-if="confirmSubMessage" class="mt-1 text-xs text-neutral-400 dark:text-neutral-600">{{ confirmSubMessage }}</p>
          <div class="mt-4 flex justify-end gap-2">
            <button class="btn-secondary" @click="closeConfirmModal">取消</button>
            <button :class="confirmButtonClass" @click="confirmAction">{{ confirmButtonText }}</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 恢复限制提示 -->
    <Transition name="modal">
      <div v-if="showRestoreBlockedModal" class="modal-overlay" @click.self="closeRestoreBlockedModal">
        <div class="panel modal-content">
          <h3 class="flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            <AppIcon name="alert" :size="14" class="text-amber-600 dark:text-amber-500" />
            无法恢复
          </h3>
          <p class="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">{{ restoreBlockedMessage }}</p>
          <div class="mt-4 flex justify-end gap-2">
            <button class="btn-secondary" @click="closeRestoreBlockedModal">知道了</button>
            <button v-if="blockedParentId" class="btn-primary" @click="handleRestoreParentInstead">
              恢复父任务「{{ blockedParentTitle }}」
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* 回收站自己的按钮：与全局设计令牌保持一致 */
.btn-primary,
.btn-secondary,
.btn-danger {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.625rem;
  font-size: 0.8125rem;
  font-weight: 500;
  border-radius: 0.375rem;
  border: none;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

.btn-primary {
  background: #171717;
  color: #fff;
}

.btn-primary:hover {
  background: #404040;
}

.btn-secondary {
  background: transparent;
  color: #525252;
  border: 1px solid #e5e5e5;
}

.btn-secondary:hover {
  background: #fafafa;
}

.btn-danger {
  background: transparent;
  color: #dc2626;
  border: 1px solid #fecaca;
}

.btn-danger:hover {
  background: #fef2f2;
}

@media (prefers-color-scheme: dark) {
  .btn-primary {
    background: #f5f5f5;
    color: #171717;
  }

  .btn-primary:hover {
    background: #fff;
  }

  .btn-secondary {
    color: #d4d4d4;
    border-color: #262626;
  }

  .btn-secondary:hover {
    background: #171717;
  }

  .btn-danger {
    color: #f87171;
    border-color: #7f1d1d;
  }

  .btn-danger:hover {
    background: rgba(127, 29, 29, 0.3);
  }
}

/* 弹窗 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal-content {
  padding: 1.125rem 1.25rem;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 16px 40px -12px rgba(0, 0, 0, 0.25);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.15s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-content,
.modal-leave-active .modal-content {
  transition: transform 0.15s ease;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.98);
}
</style>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { useTodoStore } from '@/stores/todos'
import { persistedRef, useScrollMemory } from '@/utils/uiState'

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
const trashIdSet = computed(() => new Set(trashTodos.value.map(t => t.id)))

function isParentInTrash(parentId) {
  if (!parentId) return false
  return trashIdSet.value.has(parentId)
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

// 展开/折叠状态本地保留，刷新后仍停在原来的层级
const expandedMap = persistedRef('trash-expanded', {})

// 列表变化时按当前任务重建状态：沿用已有折叠选择，新任务默认展开
watch(flatTrashList, (list) => {
  if (!list.length) return
  const next = {}
  list.forEach(item => {
    if (item.children && item.children.length) {
      next[item.id] = expandedMap.value[item.id] !== false
    }
  })
  expandedMap.value = next
}, { immediate: true })

// 列表滚动位置，刷新或来回切换后回到原处
const trashListRef = ref(null)
const { save: saveTrashScroll, restore: restoreTrashScroll } = useScrollMemory(trashListRef, () => 'trash')
watch(trashLoading, (loading) => {
  if (!loading) nextTick(restoreTrashScroll)
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
  // 已在工作区启动时预取过则直接复用, 避免每次进入视图都重新等待网络
  await todoStore.ensureTrashFetched()
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
