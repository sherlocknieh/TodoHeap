<template>
  <ul class="task-list">
    <li v-for="item in flatList" :key="item.id" :class="[
      'task-item',
      {
        'task-item-selected': selectedTaskId === item.id,
        'task-item-done': item.status === 'done'
      }
    ]" :style="{ paddingLeft: (12 + item._level * 20) + 'px' }" @click="selectTask(item.id)">
      <!-- 复选框 -->
      <div class="task-checkbox">
        <input type="checkbox" :checked="item.status === 'done'" readonly class="checkbox-input"
          @click.stop="emitToggleDone(item)" />
      </div>

      <!-- 标题 -->
      <div class="task-title-wrapper" @dblclick.stop="startEdit(item.id, item.title)">
        <span v-if="editingId !== item.id" class="task-title">
          {{ item.title || '未命名任务' }}
        </span>
        <input v-else :id="'edit-input-' + item.id" v-model="editingText" class="task-title-input"
          @blur="finishEdit(item.id)" @keyup.enter="finishEdit(item.id)" @keyup.esc="editingId = null" />
        <!-- 同步状态指示器 -->
        <span v-if="item._isSyncing" class="sync-indicator" title="正在同步...">
          <svg class="sync-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" stroke-linecap="round"/>
          </svg>
        </span>
      </div>

      <!-- 元信息 -->
      <div class="task-meta">
        <!-- 截止日期 -->
        <span v-if="item.deadline" class="task-deadline">
          {{ formatDeadline(item.deadline) }}
        </span>

        <!-- 优先级标签 -->
        <span v-if="item.priority > 0" :class="['task-priority', `priority-${item.priority}`]">
          P{{ item.priority }}
        </span>
      </div>

      <!-- 操作按钮组 -->
      <div class="task-actions">
        <button class="task-action-btn task-action-subtask" @click.stop="emitAddSubtask(item.id, startEdit)"
          title="添加子任务">
          <span class="action-icon">+</span>
        </button>
        <button class="task-action-btn task-action-delete" @click.stop="emitDeleteTodo(item.id)" title="删除任务">
          <span class="action-icon">×</span>
        </button>
      </div>
    </li>
  </ul>
</template>

<script setup>
import { computed, ref, nextTick } from 'vue'

const props = defineProps({
  node: Object,
  selectedTaskId: Number
})

const emit = defineEmits(['toggle-done', 'delete-todo', 'add-subtask', 'edit-subtask', 'task-selected'])
const emitToggleDone = (node) => emit('toggle-done', node)
const emitDeleteTodo = (id) => emit('delete-todo', id)
const emitAddSubtask = (parentId, cb) => emit('add-subtask', parentId, cb)
const emitEditSubtask = (id) => emit('edit-subtask', id, editingText.value)
const emitTaskSelected = (id) => emit('task-selected', id)

// 展平树结构为带层级的数组
function flattenTree(node, level = 0, arr = []) {
  if (!node) return arr
  arr.push({ ...node, _level: level })
  if (node.children && node.children.length) {
    node.children.forEach((child) => flattenTree(child, level + 1, arr))
  }
  return arr
}
const flatList = computed(() => flattenTree(props.node))

const editingId = ref(null)
const editingText = ref('')

function startEdit(id, title) {
  editingId.value = id
  editingText.value = title
  nextTick(() => {
    const input = document.getElementById('edit-input-' + id)
    if (input) {
      input.focus()
      input.select()
    }
  })
}

function finishEdit(id) {
  console.log('finishEdit', id, editingText.value)
  emitEditSubtask(id, editingText.value)
  editingId.value = null
  editingText.value = ''
}

function selectTask(id) {
  emitTaskSelected(id)
}

function formatDeadline(deadline) {
  if (!deadline) return ''
  const date = new Date(deadline)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)

  const diffDays = Math.floor((target - today) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '明天'
  if (diffDays === -1) return '昨天'
  if (diffDays > 0 && diffDays <= 7) return `${diffDays}天后`
  if (diffDays < 0 && diffDays >= -7) return `${Math.abs(diffDays)}天前`

  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}
</script>

<style scoped>
.task-list {
  list-style: none;
  padding: 0;
  margin: 0;
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

.task-item-done {
  opacity: 0.6;
}

.task-item-done .task-title {
  text-decoration: line-through;
  color: #94a3b8;
}

.task-checkbox {
  flex-shrink: 0;
}

.checkbox-input {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: #2563eb;
}

.task-title-wrapper {
  flex: 1;
  min-width: 0;
}

.task-title {
  display: block;
  font-size: 0.95rem;
  color: #1e293b;
  font-weight: 400;
  line-height: 1.5;
  word-break: break-word;
}

.task-title-input {
  width: 100%;
  padding: 4px 8px;
  border: 1px solid #2563eb;
  border-radius: 4px;
  font-size: 0.95rem;
  outline: none;
  background: #fff;
}

.task-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.task-deadline {
  font-size: 0.85rem;
  color: #64748b;
  padding: 2px 8px;
  background: #f1f5f9;
  border-radius: 4px;
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

.task-action-delete:hover {
  background: #fee2e2;
  color: #dc2626;
}

.action-icon {
  font-size: 18px;
  line-height: 1;
  font-weight: 300;
}

/* 同步指示器 */
.sync-indicator {
  display: inline-flex;
  align-items: center;
  margin-left: 6px;
  color: #64748b;
}

.sync-icon {
  width: 14px;
  height: 14px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 640px) {
  .task-meta {
    display: none;
  }

  .task-actions {
    opacity: 1;
  }
}
</style>
