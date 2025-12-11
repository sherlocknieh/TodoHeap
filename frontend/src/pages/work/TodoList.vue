<template>
  <!-- Todo 列表视图 -->
  <div class="todo-app">
    <div class="todo-header">
      <h1>Todo List</h1>
      <p class="todo-subtitle">Keep track of your tasks</p>
    </div>
    
    <div class="input-group">
      <input 
        v-model="newTaskText" 
        @keyup.enter="addTodo"
        placeholder="Add a new task..."
        class="task-input"
      />
      <button @click="addTodo" :disabled="isAdding" class="add-btn">
        {{ isAdding ? 'Adding...' : '＋ Add' }}
      </button>
    </div>

    <div v-if="errorText" class="error-alert">
      <span class="error-icon">⚠</span>
      {{ errorText }}
    </div>

    <div v-if="todos.length === 0" class="empty-state">
      <p class="empty-icon">📝</p>
      <p class="empty-text">No tasks yet. Add one to get started!</p>
    </div>

    <ul class="todo-list" v-else>
      <TodoTreeItem
        v-for="node in treeNodes"
        :key="node.id"
        :node="node"
        :selected-task-id="selectedTaskId"
        @toggle-done="toggleDone"
        @delete-todo="deleteTodo"
        @add-subtask="addSubtask"
        @edit-subtask="editSubtask"
        @task-selected="handleTaskSelected"
      />
    </ul>

  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useTodoStore } from '../../stores/todos'
import { useAuthStore } from '../../stores/auth'
import TodoTreeItem from '../../components/TodoTreeItem.vue'

const todoStore = useTodoStore()
const authStore = useAuthStore()

const newTaskText = ref('')
const isAdding = ref(false)
const selectedTaskId = ref(null)
const emit = defineEmits(['task-selected'])

// 从 store 获取数据
const todos = computed(() => todoStore.todos)
const errorText = computed(() => todoStore.error)
const treeNodes = computed(() => todoStore.treeNodes)

onMounted(async () => {
  if (authStore.isAuthenticated && todos.value.length === 0) {
    await todoStore.fetchTodos()
  }
})

const addTodo = async () => {
  const task = newTaskText.value.trim()
  if (!task || isAdding.value) return

  isAdding.value = true

  try {
    const result = await todoStore.addTodo(task)
    if (result.success) {
      newTaskText.value = ''
    }
  } finally {
    isAdding.value = false
  }
}

const addSubtask = async (parentId, startEditCb) => {
  // 默认标题
  const result = await todoStore.addTodo('新子任务', { parent_id: parentId })
  if (result.success && result.data) {
    // 进入编辑模式
    startEditCb(result.data.id, result.data.title)
  }
}

const editSubtask = async (id, newTitle) => {
  await todoStore.updateTodo(id, { title: newTitle })
}

const deleteTodo = async (id) => {
  await todoStore.deleteTodo(id)
}

const toggleDone = async (todo) => {
  await todoStore.toggleDone(todo.id)
}

const handleTaskSelected = (taskId) => {
  selectedTaskId.value = taskId
  emit('task-selected', taskId)
}
</script>

<style scoped>
.todo-app {
  font-family: var(--font-base);
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem 1rem;
  height: 90vh;
  display: flex;
  flex-direction: column;
}

.todo-header {
  text-align: center;
  margin-bottom: 3rem;
}

h1 {
  color: var(--color-primary);
  margin: 0 0 0.5rem 0;
  font-size: 2.5rem;
  font-weight: 700;
  letter-spacing: -0.5px;
}

.todo-subtitle {
  color: var(--color-text);
  opacity: 0.6;
  margin: 0;
  font-size: 1rem;
}

.input-group {
  display: flex;
  gap: 12px;
  margin-bottom: 2rem;
}

.task-input {
  flex: 1;
  padding: 12px 16px;
  border: 2px solid var(--color-border);
  border-radius: 8px;
  font-size: 1rem;
  font-family: var(--font-base);
  background: var(--color-surface);
  color: var(--color-text);
  transition: all 0.2s ease;
}

.task-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(66, 184, 131, 0.1);
}

.task-input::placeholder {
  color: var(--color-text);
  opacity: 0.4;
}

.add-btn {
  padding: 12px 24px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 1rem;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.add-btn:hover:not(:disabled) {
  background: var(--color-primary-variant);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(66, 184, 131, 0.3);
}

.add-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-alert {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #721c24;
  background-color: #f8d7da;
  border: 1px solid #f5c6cb;
  padding: 12px 16px;
  margin-bottom: 1.5rem;
  border-radius: 8px;
}

.error-icon {
  font-size: 1.2rem;
  flex-shrink: 0;
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--color-text);
  opacity: 0.6;
}

.empty-icon {
  font-size: 3rem;
  margin: 0;
}

.empty-text {
  margin: 0.5rem 0 0 0;
  font-size: 1rem;
}

.todo-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  margin: 0;
  padding-left: 0;
  list-style: none;
}

.todo-list ul {
  padding-left: 24px;
  margin-top: 8px;
}

.todo-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  margin-bottom: 8px;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.todo-item:hover {
  border-color: var(--color-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.todo-item.done {
  opacity: 0.6;
  background: var(--color-bg);
}

.todo-item.done .todo-title {
  text-decoration: line-through;
  color: var(--color-text);
  opacity: 0.5;
}

.todo-main {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  flex: 1;
}

.todo-checkbox {
  flex-shrink: 0;
}

.checkbox-input {
  width: 20px;
  height: 20px;
  cursor: pointer;
  accent-color: var(--color-primary);
}

.todo-title {
  flex: 1;
  color: var(--color-text);
  word-break: break-word;
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

/* 响应式设计 */
@media (max-width: 640px) {
  .todo-app {
    padding: 1rem;
  }

  h1 {
    font-size: 2rem;
  }

  .input-group {
    gap: 8px;
  }

  .task-input,
  .add-btn {
    font-size: 16px; /* 防止 iOS 自动缩放 */
  }

  .status-pill {
    font-size: 0.75rem;
    padding: 3px 8px;
  }

  .todo-main {
    gap: 8px;
  }

  .delete-btn {
    padding: 4px 8px;
    margin-left: 8px;
  }
}
</style>
