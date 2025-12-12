<template>
  <li
    v-for="item in flatList"
    :key="item.id"
    :class="['todo-item', { done: item.status === 'done', selected: selectedTaskId === item.id }]"
    :style="{ marginLeft: (item._level * 24) + 'px' }"
  >
    <div class="todo-main" @click="emitToggleDone(item)">
      <div class="todo-checkbox">
        <input
          type="checkbox"
          :checked="item.status === 'done'"
          readonly
          class="checkbox-input"
        />
      </div>
      <span
        v-if="editingId !== item.id"
        class="todo-title"
        @click.stop="selectTask(item.id)"
      >
        {{ item.title || '未命名任务' }}
      </span>
      <input
        v-else
        :id="'edit-input-' + item.id"
        v-model="editingText"
        class="todo-title"
        @blur="finishEdit(item.id)"
        @keyup.enter="finishEdit(item.id)"
      />
      <span class="status-pill" :data-status="item.status">
        {{ item.status === 'done' ? '✓ 完成' : item.status === 'doing' ? '⚡ 进行中' : '○ 待办' }}
      </span>
      <button class="add-subtask-btn" @click.stop="emitAddSubtask(item.id, startEdit)">＋ 子任务</button>
      <button v-if="selectedTaskId === item.id" class="select-btn selected">✓ 已选择</button>
      <button v-else class="select-btn" @click.stop="selectTask(item.id)">选择</button>
    </div>
    <button class="delete-btn" @click.stop="emitDeleteTodo(item.id)" title="删除任务">×</button>
  </li>
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
const emitEditSubtask = (id) => emit('edit-subtask', id)
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
    if (input) input.focus()
  })
}

function finishEdit(id) {
  emitEditSubtask(id, editingText.value)
  editingId.value = null
  editingText.value = ''
}

function selectTask(id) {
  emitTaskSelected(id)
}
</script>

<style scoped>

.todo-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  margin-bottom: 6px;
  border-radius: 6px;
  position: relative;
}

.todo-item.done {
  opacity: 0.7;
  background: #f8fafc;
}

.todo-main {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  width: 100%;
  flex: 1;
  min-width: 0;
}

.todo-checkbox {
  flex-shrink: 0;
}

.checkbox-input {
  width: 20px;
  height: 20px;
  cursor: pointer;
  accent-color: #2563eb;
}

.todo-title {
  flex: 1;
  color: #0f172a;
  word-break: break-word;
  font-size: 0.95rem;
  font-weight: 500;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #0f172a;
  background: #eef2ff;
  flex-shrink: 0;
}

.status-pill[data-status='todo'] {
  color: #1d4ed8;
  background: #e0e7ff;
}

.status-pill[data-status='doing'] {
  color: #b45309;
  background: #fef3c7;
}

.status-pill[data-status='done'] {
  color: #065f46;
  background: #d1fae5;
}

.delete-btn {
  background-color: transparent;
  color: #ef4444;
  padding: 4px 6px;
  margin-left: 10px;
  border: 1px solid #fecdd3;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 500;
  flex-shrink: 0;
  align-self: center;
}

.add-subtask-btn {
  background: #f8fafc;
  color: #1d4ed8;
  border: 1px solid #e0e7ff;
  border-radius: 6px;
  padding: 4px 8px;
  margin-left: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
}

.select-btn {
  background: #ecfdf3;
  color: #047857;
  border: 1px solid #bbf7d0;
  border-radius: 6px;
  padding: 4px 8px;
  margin-left: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
}

.todo-item.selected {
  border-color: #bbf7d0;
  background: #f0fdf4;
}
</style>
