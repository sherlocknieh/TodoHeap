<template>
  <div class="trash-container">
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

    <!-- 任务列表 -->
    <ul v-else class="task-list">
      <li
        v-for="todo in trashTodos"
        :key="todo.id"
        :class="['task-item', 'task-item-deleted', { 'task-item-selected': props.selectedTaskId === todo.id }]"
        @click="selectTask(todo.id)"
      >
        <!-- 删除标记图标 -->
        <div class="task-checkbox">
          <span class="deleted-icon">🗑️</span>
        </div>

        <!-- 标题 -->
        <div class="task-title-wrapper">
          <span class="task-title">{{ todo.title || '未命名任务' }}</span>
          <span v-if="todo.description" class="task-desc">{{ truncate(todo.description, 30) }}</span>
        </div>

        <!-- 元信息 -->
        <div class="task-meta">
          <span class="task-date">删除于 {{ formatDate(todo.deleted_at) }}</span>
          <span v-if="todo.priority > 0" :class="['task-priority', `priority-${todo.priority}`]">
            P{{ todo.priority }}
          </span>
        </div>

        <!-- 操作按钮组 -->
        <div class="task-actions">
          <button
            class="task-action-btn task-action-restore"
            @click.stop="handleRestore(todo.id)"
            title="恢复任务"
          >
            <span class="action-icon">↩</span>
          </button>
          <button
            class="task-action-btn task-action-delete"
            @click.stop="handlePermanentDelete(todo.id)"
            title="永久删除"
          >
            <span class="action-icon">×</span>
          </button>
        </div>
      </li>
    </ul>

    <!-- 确认弹窗 -->
    <Transition name="modal">
      <div v-if="showConfirmModal" class="modal-overlay" @click.self="closeConfirmModal">
        <div class="modal-content">
          <h3>{{ confirmTitle }}</h3>
          <p>{{ confirmMessage }}</p>
          <div class="modal-actions">
            <button class="btn btn-secondary" @click="closeConfirmModal">取消</button>
            <button class="btn btn-danger" @click="confirmAction">确认</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useTodoStore } from '../../stores/todos'

const props = defineProps({
  selectedTaskId: {
    type: Number,
    default: null
  }
})

const emit = defineEmits(['task-selected'])

const todoStore = useTodoStore()

const trashTodos = computed(() => todoStore.trashTodos)
const trashLoading = computed(() => todoStore.trashLoading)
const loading = computed(() => todoStore.loading)

// 确认弹窗状态
const showConfirmModal = ref(false)
const confirmTitle = ref('')
const confirmMessage = ref('')
const pendingAction = ref(null)

onMounted(async () => {
  await todoStore.fetchTrash()
})

// 格式化日期
function formatDate(dateStr) {
  if (!dateStr) return '未知'
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now - date
  
  // 小于1分钟
  if (diff < 60 * 1000) {
    return '刚刚'
  }
  // 小于1小时
  if (diff < 60 * 60 * 1000) {
    return `${Math.floor(diff / (60 * 1000))} 分钟前`
  }
  // 小于24小时
  if (diff < 24 * 60 * 60 * 1000) {
    return `${Math.floor(diff / (60 * 60 * 1000))} 小时前`
  }
  // 小于7天
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    return `${Math.floor(diff / (24 * 60 * 60 * 1000))} 天前`
  }
  // 超过7天显示具体日期
  return date.toLocaleDateString('zh-CN')
}

// 截断文本
function truncate(text, maxLength) {
  if (!text) return ''
  return text.length > maxLength ? text.slice(0, maxLength) + '...' : text
}

// 选择任务
function selectTask(id) {
  emit('task-selected', id)
}

// 恢复单个任务
async function handleRestore(id) {
  const result = await todoStore.restoreTodo(id)
  if (!result.success) {
    alert('恢复失败：' + result.error)
  }
}

// 永久删除单个任务
function handlePermanentDelete(id) {
  confirmTitle.value = '永久删除'
  confirmMessage.value = '此操作不可恢复，确定要永久删除这个任务吗？'
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

/* 任务列表样式 - 与 TodoListItem 一致 */
.task-list {
  list-style: none;
  padding: 0;
  margin: 0;
  flex: 1;
  overflow-y: auto;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid #f1f5f9;
  background: #fff;
  transition: background-color 0.15s ease;
  cursor: pointer;
}

.task-item:hover {
  background: #f8fafc;
}

.task-item:last-child {
  border-bottom: none;
}

.task-item-selected {
  background: #eff6ff;
  border-left: 3px solid #2563eb;
}

.task-item-deleted .task-title {
  text-decoration: line-through;
  color: #94a3b8;
}

.task-checkbox {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.deleted-icon {
  font-size: 14px;
  opacity: 0.6;
}

.task-title-wrapper {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.task-title {
  display: block;
  font-size: 0.95rem;
  color: #1e293b;
  font-weight: 400;
  line-height: 1.5;
  word-break: break-word;
}

.task-desc {
  font-size: 0.8rem;
  color: #94a3b8;
  line-height: 1.4;
}

.task-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.task-date {
  font-size: 0.8rem;
  color: #94a3b8;
}

.task-priority {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
}

.priority-1 {
  background: #fef3c7;
  color: #92400e;
}

.priority-2 {
  background: #fed7aa;
  color: #9a3412;
}

.priority-3 {
  background: #fecaca;
  color: #991b1b;
}

.task-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.task-item:hover .task-actions {
  opacity: 1;
}

.task-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.15s ease;
  color: #64748b;
}

.task-action-btn:hover {
  background: #e2e8f0;
}

.task-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.task-action-restore:hover {
  background: #d1fae5;
  color: #059669;
}

.task-action-delete:hover {
  background: #fee2e2;
  color: #dc2626;
}

.action-icon {
  font-size: 18px;
  line-height: 1;
  font-weight: 300;
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
  margin: 0 0 1.5rem;
  color: #64748b;
  font-size: 0.875rem;
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
  .task-meta {
    display: none;
  }

  .task-actions {
    opacity: 1;
  }

  .header-actions {
    flex-direction: column;
    gap: 0.25rem;
  }

  .btn {
    padding: 0.375rem 0.75rem;
    font-size: 0.8rem;
  }
}
</style>
