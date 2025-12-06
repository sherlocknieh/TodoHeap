<script setup>
import { ref, onMounted, computed } from 'vue'
import { useTodoStore } from '../../stores/todos'
import { useAuthStore } from '../../stores/auth'

const todoStore = useTodoStore()
const authStore = useAuthStore()

const newTaskText = ref('')
const isAdding = ref(false)

// 从 store 获取数据
const todos = computed(() => todoStore.todos)
const errorText = computed(() => todoStore.error)

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

const deleteTodo = async (id) => {
  await todoStore.deleteTodo(id)
}

const toggleDone = async (todo) => {
  await todoStore.toggleDone(todo.id)
}
</script>

<template>
  <div class="todo-app">
    <h1>Todo List.</h1>
    
    <div class="input-group">
      <input 
        v-model="newTaskText" 
        @keyup.enter="addTodo"
      />
      <button @click="addTodo" :disabled="isAdding">Add</button>
    </div>

    <div v-if="errorText" class="error-alert">
      {{ errorText }}
    </div>

    <ul class="todo-list">
      <li v-for="todo in todos" :key="todo.id" :class="{ done: todo.status === 'done' }">
        <div class="todo-main" @click="toggleDone(todo)">
          <span class="todo-title">{{ todo.title }}</span>
          <span class="status-pill" :data-status="todo.status">
            {{ todo.status === 'done' ? '完成' : todo.status === 'doing' ? '进行中' : '待办' }}
          </span>
        </div>
        <button class="delete-btn" @click.stop="deleteTodo(todo.id)">x</button>
      </li>
    </ul>

  </div>
</template>

<style scoped>
.todo-app {
  font-family: Arial, sans-serif;
  margin: 0 auto;
  text-align: left;
}

h1 {
  text-align: center;
  color: #42b883;
  margin-bottom: 2rem;
}

.input-group {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

input {
  flex: 1;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

button {
  padding: 8px 16px;
  background-color: #42b883;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:hover {
  background-color: #33a06f;
}

.error-alert {
  color: #721c24;
  background-color: #f8d7da;
  border-color: #f5c6cb;
  padding: .75rem 1.25rem;
  margin-bottom: 1rem;
  border: 1px solid transparent;
  border-radius: .25rem;
}

.todo-list {
  list-style: none;
  padding: 0;
}

li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  background: #2f2f2f;
  margin-bottom: 5px;
  border-radius: 4px;
}

li span {
  cursor: pointer;
  flex: 1;
}

li.done span {
  text-decoration: line-through;
  color: #888;
}

.todo-main {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.todo-title {
  flex: 1;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
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
  background-color: #ff4444;
  padding: 4px 8px;
  margin-left: 10px;
}

.delete-btn:hover {
  background-color: #cc0000;
}

</style>
