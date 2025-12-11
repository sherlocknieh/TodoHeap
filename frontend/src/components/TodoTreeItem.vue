<template>
  <li v-for="item in flatList" :key="item.id" :class="['todo-item', { done: item.status === 'done', selected: selectedTaskId === item.id }]" :style="{ marginLeft: (item._level * 32) + 'px' }">
    <div class="todo-main" @click="emitToggleDone(item)">
      <div class="todo-checkbox">
        <input
          type="checkbox"
          :checked="item.status === 'done'"
          readonly
          class="checkbox-input"
        />
      </div>
      <span v-if="editingId !== item.id" class="todo-title" @click.stop="selectTask(item.id)">{{ item.title }}</span>
      <input v-else :id="'edit-input-' + item.id" v-model="editingText" class="todo-title" @blur="finishEdit(item.id)" @keyup.enter="finishEdit(item.id)" />
      <span class="status-pill" :data-status="item.status">
        {{ item.status === 'done' ? '✓ 完成' : item.status === 'doing' ? '⚡ 进行中' : '○ 待办' }}
      </span>
      <button class="add-subtask-btn" @click.stop="emitAddSubtask(item.id, startEdit)">＋ 子任务</button>
      <button v-if="selectedTaskId === item.id" class="select-btn selected">✓ 已选择</button>
      <button v-else class="select-btn" @click.stop="selectTask(item.id)">选择</button>
    </div>
    <button class="delete-btn" @click.stop="emitDeleteTodo(item.id)" title="Delete task">×</button>
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
  arr.push({ ...node, _level: level })
  if (node.children && node.children.length) {
    node.children.forEach(child => flattenTree(child, level + 1, arr))
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
  display: block;
  width: 100%;
  padding: 10px 16px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  margin-bottom: 6px;
  border-radius: 8px;
  transition: box-shadow 0.2s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.03);
  position: relative;
}

.todo-item.done {
  opacity: 0.6;
  background: var(--color-bg, #f3f4f6);
}

.todo-main {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  width: 100%;
}

.todo-checkbox {
  flex-shrink: 0;
}

.checkbox-input {
  width: 20px;
  height: 20px;
  cursor: pointer;
  accent-color: var(--color-primary, #3b82f6);
}

.todo-title {
  flex: 1;
  color: var(--color-text, #222);
  word-break: break-word;
  font-size: 1rem;
  font-weight: 500;
  transition: all 0.2s ease;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 600;
  color: white;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.status-pill[data-status='todo'] {
  background: #3b82f6;
}

.status-pill[data-status='doing'] {
  background: #f59e0b;
}

.status-pill[data-status='done'] {
  background: #10b981;
}

.delete-btn {
  background-color: #ef4444;
  color: white;
  padding: 6px 12px;
  margin-left: 12px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1.2rem;
  font-weight: 300;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.delete-btn:hover {
  background-color: #dc2626;
  transform: scale(1.1);
}

.delete-btn:active {
  transform: scale(0.95);
}

.add-subtask-btn {
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 4px 10px;
  margin-left: 8px;
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: 500;
  transition: background 0.2s;
}
.add-subtask-btn:hover {
  background: #2563eb;
}

.select-btn {
  background: #10b981;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 4px 10px;
  margin-left: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.2s;
}

.select-btn:hover {
  background: #059669;
}

.select-btn.selected {
  background: #059669;
  cursor: default;
}

.todo-item.selected {
  border-color: #10b981;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
}
</style>
