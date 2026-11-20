<template>
  <div class="h-full flex flex-col min-h-0" ref="trashContainerRef" @click.capture="handleRowClickCapture">
    <!-- 页面操作：已删除数量与恢复、清空入口放进主区域顶栏 -->
    <Teleport defer to="#main-topbar-actions">
      <p class="min-w-0 truncate whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">
        <span class="font-mono">{{ trashTodos.length }}</span> 个已删除任务
      </p>
      <div class="flex shrink-0 items-center gap-2">
        <!-- 「回收站多选操作」：选中多条时顶栏换成批量恢复/永久删除，优先于单条与全局操作 -->
        <template v-if="selectionSize">
          <span class="text-xs text-neutral-500 dark:text-neutral-400"
            title="Ctrl/⌘ 继续选择，Shift 连选">已选
            <span class="font-mono font-medium text-accent-700 dark:text-accent-300">{{ selectionSize }}</span> 项</span>
          <button class="btn-secondary" @click="restoreSelectedTodos">
            <AppIcon name="undo" :size="14" />
            <span>恢复</span>
          </button>
          <button class="btn-danger" @click="handlePermanentDeleteSelected">
            <AppIcon name="trash" :size="14" />
            <span>永久删除</span>
          </button>
          <button class="btn-secondary" @click="clearSelection">
            <AppIcon name="close" :size="14" />
            <span>取消</span>
          </button>
        </template>
        <!-- 选中任务时只针对该任务操作 -->
        <template v-else-if="props.selectedTaskId != null">
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

    <!-- 任务列表：卡片几何与任务表一致（左右内距、行距、缩进） -->
    <ul v-else ref="trashListRef" class="list-none flex-1 min-h-0 overflow-y-auto space-y-1.5"
      @scroll.passive="saveTrashScroll">
      <template v-for="item in flatTrashList" :key="item.id">
        <li v-if="visibleTrashIds.has(item.id)" :data-task-item="item.id" :data-task-id="item.id"
          class="group cursor-pointer" :style="{ paddingLeft: (22 + item._level * 28) + 'px' }" @click="selectTask(item.id)">
          <!-- 缩进留在外层，行内容单独成块；选中与任务添加栏一样只换边框色和投影 -->
          <div class="flex items-center gap-2.5 rounded-lg transition-[border-color,box-shadow]" :class="[
            isRowSelected(item.id)
              ? 'border border-accent-500 bg-surface py-1.5 pl-2 pr-1.5 shadow-[0_3px_10px_rgb(6_80_48/0.09)] dark:border-accent-500/60 dark:bg-surface-dark dark:shadow-none'
              : 'border border-hairline bg-surface py-1.5 pl-2 pr-1.5 shadow-[0_1px_2px_rgb(6_80_48/0.05)] hover:border-accent-500/40 hover:shadow-[0_3px_10px_rgb(6_80_48/0.09)] dark:border-hairline-dark dark:bg-surface-dark dark:shadow-none dark:hover:border-accent-500/40'
          ]">
            <!-- 折叠开关：与列表同款圆形 +/−；无子任务时用垃圾桶占位，保持标题左缘对齐 -->
            <button v-if="item.children && item.children.length" type="button"
              class="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border border-neutral-300 text-neutral-500 transition-colors hover:border-accent-500 hover:text-accent-700 dark:border-neutral-600 dark:text-neutral-400 dark:hover:border-accent-400 dark:hover:text-accent-200"
              :title="isTaskCollapsed(item.id) ? '展开子任务' : '折叠子任务'"
              :aria-label="isTaskCollapsed(item.id) ? '展开子任务' : '折叠子任务'"
              :aria-expanded="!isTaskCollapsed(item.id)" @click.stop="toggleExpand(item.id)">
              <AppIcon :name="isTaskCollapsed(item.id) ? 'plus' : 'minus'" :size="8" />
            </button>
            <span v-else
              class="grid h-[18px] w-[18px] shrink-0 place-items-center text-neutral-300 dark:text-neutral-700">
              <AppIcon name="trash" :size="13" />
            </span>

            <!-- 标题 -->
            <div class="flex-1 min-w-0 flex items-baseline gap-2">
              <span class="text-sm leading-5 text-neutral-400 dark:text-neutral-600 line-through truncate">
                {{ item.title || '未命名任务' }}
              </span>
              <span v-if="item.children && item.children.length" class="shrink-0 text-[11px] text-neutral-400 dark:text-neutral-600">
                {{ item.children.length }} 个子任务
              </span>
            </div>

            <!-- 元信息：删除时间用纯文本，不做胶囊 -->
            <div class="flex items-center gap-2 shrink-0">
              <span class="font-mono text-[11px] text-neutral-400 dark:text-neutral-600">
                {{ formatDate(item.deleted_at) }}
              </span>
            </div>

            <!-- 行内操作：与列表一致常显，不再只在悬停时出现 -->
            <div class="flex items-center gap-0.5 shrink-0">
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

html[data-theme='dark'] .btn-primary {
  background: #f5f5f5;
  color: #171717;
}
html[data-theme='dark'] .btn-primary:hover {
  background: #fff;
}
html[data-theme='dark'] .btn-secondary {
  color: #d4d4d4;
  border-color: #262626;
}
html[data-theme='dark'] .btn-secondary:hover {
  background: #171717;
}
html[data-theme='dark'] .btn-danger {
  color: #f87171;
  border-color: #7f1d1d;
}
html[data-theme='dark'] .btn-danger:hover {
  background: rgba(127, 29, 29, 0.3);
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
import { useScrollMemory } from '@/utils/uiState'
import { isTaskCollapsed, toggleTaskCollapsed } from '@/utils/taskCollapse'
import { pruneSelection, selectRange, toggleSelection } from '@/utils/taskSelection'

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

// 引用行不重复展示：同一任务在回收站只出现一次；折叠状态与其它视图共享
const visibleTrashIds = computed(() => {
  const childrenOf = new Map()
  const roots = []

  flatTrashList.value.forEach((item) => {
    if (item._isRef) return
    if (!isParentInTrash(item.parent_id)) {
      roots.push(item.id)
      return
    }
    if (!childrenOf.has(item.parent_id)) childrenOf.set(item.parent_id, [])
    childrenOf.get(item.parent_id).push(item.id)
  })

  const visible = new Set()
  const queue = [...roots]
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index]
    if (visible.has(id)) continue
    visible.add(id)
    if (isTaskCollapsed(id)) continue
    ;(childrenOf.get(id) || []).forEach((childId) => queue.push(childId))
  }
  return visible
})

// 列表滚动位置，刷新或来回切换后回到原处
const trashListRef = ref(null)
const { save: saveTrashScroll, restore: restoreTrashScroll } = useScrollMemory(trashListRef, () => 'trash')
watch(trashLoading, (loading) => {
  if (!loading) nextTick(restoreTrashScroll)
})

const toggleExpand = (id) => {
  toggleTaskCollapsed(id, false)
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

// 多选：与任务表共用一套键与连选规则；选中后顶栏换成批量操作
const selection = ref(new Set())
const selectionAnchor = ref(null)
const selectionSize = computed(() => selection.value.size)
const isRowSelected = (id) => props.selectedTaskId === id || selection.value.has(String(id))
const clearSelection = () => {
  selection.value = new Set()
  selectionAnchor.value = null
}

// 只移除指定键，批量操作后保留其余选择
function removeSelection(keys) {
  if (!keys.length) return
  const next = new Set(selection.value)
  keys.forEach(key => next.delete(key))
  selection.value = next
  if (selectionAnchor.value && keys.includes(selectionAnchor.value)) selectionAnchor.value = null
}

// Ctrl/⌘ 切换、Shift 按可见行连选；普通点击清空选择后照常选中任务
function handleRowClickCapture(event) {
  const row = event.target.closest?.('[data-task-item]')
  if (!row) return
  const key = row.dataset.taskId ? String(row.dataset.taskId) : ''
  if (!key) return
  // 行内的恢复/删除按钮优先，不让多选拦截
  if (event.target.closest('button, input, select, textarea, a, label')) return

  if (event.metaKey || event.ctrlKey) {
    event.preventDefault()
    event.stopPropagation()
    selection.value = toggleSelection(selection.value, key)
    selectionAnchor.value = key
    return
  }

  if (event.shiftKey && selectionAnchor.value) {
    const container = trashContainerRef.value
    const keys = container
      ? [...container.querySelectorAll('[data-task-item]')].map(el => String(el.dataset.taskId))
      : []
    // 锚点被折叠隐藏时按普通点击处理
    if (keys.includes(selectionAnchor.value)) {
      event.preventDefault()
      event.stopPropagation()
      selection.value = selectRange(selection.value, keys, selectionAnchor.value, key)
      return
    }
  }

  clearSelection()
}

// 回收站条目变化后清掉已恢复或已删除的选择键
watch(trashTodos, (items) => {
  const available = new Set(items.map(todo => String(todo.id)))
  selection.value = pruneSelection(selection.value, available)
  if (selectionAnchor.value && !available.has(selectionAnchor.value)) selectionAnchor.value = null
})

// 批量恢复按树的从上到下顺序：父任务先恢复，子任务随后就能正常恢复
function selectedInTreeOrder() {
  const seen = new Set()
  return flatTrashList.value
    .filter(item => !item._isRef && selection.value.has(String(item.id)))
    .map(item => item.id)
    .filter((id) => {
      const key = String(id)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

// 批量恢复：父级仍在回收站的任务恢复到根节点，其余按常规恢复
async function restoreSelectedTodos() {
  const ids = selectedInTreeOrder()
  clearSelection()
  const failures = []

  for (const id of ids) {
    if (!trashTodos.value.some(todo => todo.id === id)) continue
    const check = todoStore.canRestoreTodo(id)
    let result
    if (check.canRestore) {
      result = await todoStore.restoreTodo(id)
    } else if (check.parentId != null) {
      result = await todoStore.restoreTodoToRoot(id)
    } else {
      result = { success: false, error: check.reason }
    }
    if (!result.success) failures.push(result.error)
  }

  if (failures.length) alert(`部分任务恢复失败：${failures[0]}`)
}

// 批量永久删除：先确认，再逐棵删除；已被祖先带走的任务自动跳过
function handlePermanentDeleteSelected() {
  const ids = selectedInTreeOrder()
  if (!ids.length) return

  // 父子同时选中时子任务只算一次，避免重复计数
  const allIds = new Set(ids.map(String))
  ids.forEach((id) => {
    todoStore.findTrashDescendantIds(id).forEach(childId => allIds.add(String(childId)))
  })
  const extraCount = allIds.size - ids.length

  confirmTitle.value = '永久删除'
  confirmMessage.value = `此操作不可恢复，确定要永久删除选中的 ${ids.length} 个任务吗？`
  confirmSubMessage.value = extraCount > 0 ? `将同时删除 ${extraCount} 个子任务` : ''
  confirmButtonText.value = '删除'
  confirmButtonClass.value = 'btn-danger'
  pendingAction.value = async () => {
    const failures = []
    for (const id of ids) {
      if (!trashTodos.value.some(todo => todo.id === id)) continue
      const result = await todoStore.permanentDeleteTodo(id)
      if (!result.success) failures.push(result.error)
    }
    clearSelection()
    if (failures.length) alert(`部分任务删除失败：${failures[0]}`)
  }
  showConfirmModal.value = true
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
