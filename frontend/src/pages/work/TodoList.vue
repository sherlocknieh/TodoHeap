<template>
  <div class="tt-shell">
    <header class="tt-hero">
      <div>
        <p class="eyebrow">滴答清单风格 · 今日概览</p>
        <h1>我的任务</h1>
        <div class="hero-meta">
          <span>{{ stats.todo }} 待办</span>
          <span>{{ stats.today }} 今天</span>
          <span>{{ stats.upcoming }} 即将到期</span>
          <span>{{ stats.done }} 已完成</span>
        </div>
      </div>
      <div class="progress-card">
        <div class="progress-top">
          <span>完成度</span>
          <strong>{{ completion }}%</strong>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: completion + '%' }"></div>
        </div>
      </div>
    </header>

    <section class="tt-filters">
      <div class="filter-chips">
        <button
          v-for="f in filters"
          :key="f.value"
          :class="['chip', { active: activeFilter === f.value }]"
          @click="activeFilter = f.value"
        >
          {{ f.label }}
          <span class="chip-count">{{ f.badge }}</span>
        </button>
      </div>
      <div class="filter-tools">
        <div class="input-with-icon">
          <span class="icon">🔍</span>
          <input v-model.trim="searchText" placeholder="搜索任务或子任务" />
        </div>
        <select v-model="priorityFilter" class="select">
          <option value="all">优先级（全部）</option>
          <option value="2">P1 最高</option>
          <option value="1">P2 较高</option>
          <option value="0">P3 一般</option>
        </select>
      </div>
    </section>

    <section class="tt-quick">
      <div class="quick-left">
        <input
          v-model.trim="newTaskTitle"
          @keyup.enter="addTodo"
          placeholder="快速记录：输入任务，回车即可添加"
        />
        <input v-model="newTaskDate" type="date" class="date-input" />
        <select v-model.number="newTaskPriority" class="select">
          <option :value="2">P1</option>
          <option :value="1">P2</option>
          <option :value="0">P3</option>
        </select>
      </div>
      <button class="primary" :disabled="isAdding" @click="addTodo">
        {{ isAdding ? '添加中...' : '添加任务' }}
      </button>
    </section>

    <section v-if="errorText" class="banner error">
      <span>⚠</span>
      <span>{{ errorText }}</span>
    </section>

    <section v-if="loading" class="banner muted">同步中，请稍候...</section>

    <section v-if="!loading && visibleCount === 0" class="empty">
      <div class="empty-icon">🌤</div>
      <p>所有清单都清空了，添加一个新的吧！</p>
    </section>

    <ul v-else class="tt-list">
      <TodoListItem
        v-for="node in filteredTree"
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
import TodoListItem from '../../components/TodoListItem.vue'

const todoStore = useTodoStore()
const authStore = useAuthStore()
const emit = defineEmits(['task-selected'])

const newTaskTitle = ref('')
const newTaskDate = ref('')
const newTaskPriority = ref(1)
const isAdding = ref(false)
const activeFilter = ref('all')
const priorityFilter = ref('all')
const searchText = ref('')
const selectedTaskId = ref(null)

const todos = computed(() => todoStore.todos)
const loading = computed(() => todoStore.loading)
const errorText = computed(() => todoStore.error)

onMounted(async () => {
  if (authStore.isAuthenticated && todos.value.length === 0) {
    await todoStore.fetchTodos()
  }
})

// 以滴答清单的分组方式进行树构建与过滤
const taskTree = computed(() => {
  const nodes = todos.value.map((item) => ({
    id: item.id,
    title: item.title,
    status: item.status || 'todo',
    priority: item.priority ?? 0,
    deadline: item.deadline || null,
    parent_id: item.parent_id,
    children: []
  }))

  const map = new Map()
  nodes.forEach((n) => map.set(n.id, n))

  const roots = []
  nodes.forEach((n) => {
    if (n.parent_id && map.has(n.parent_id)) {
      map.get(n.parent_id).children.push(n)
    } else {
      roots.push(n)
    }
  })

  const sortFn = (a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id - b.id
  const sortTree = (arr) => {
    arr.sort(sortFn)
    arr.forEach((child) => sortTree(child.children))
  }
  sortTree(roots)
  return roots
})

const isToday = (deadline) => {
  if (!deadline) return false
  const d = new Date(deadline)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

const isUpcoming = (deadline) => {
  if (!deadline) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(deadline)
  target.setHours(0, 0, 0, 0)
  return target > today
}

const matchesFilters = (node) => {
  if (priorityFilter.value !== 'all' && (node.priority ?? 0) !== Number(priorityFilter.value)) return false
  if (searchText.value && !node.title.toLowerCase().includes(searchText.value.toLowerCase())) return false

  switch (activeFilter.value) {
    case 'today':
      return isToday(node.deadline)
    case 'upcoming':
      return isUpcoming(node.deadline)
    case 'done':
      return node.status === 'done'
    case 'all':
    default:
      return true
  }
}

const filterTree = (list) => {
  return list
    .map((n) => {
      const children = filterTree(n.children || [])
      const match = matchesFilters(n)
      if (match || children.length) {
        return { ...n, children }
      }
      return null
    })
    .filter(Boolean)
}

const filteredTree = computed(() => filterTree(taskTree.value))
const countNodes = (list) => list.reduce((acc, n) => acc + 1 + countNodes(n.children || []), 0)
const visibleCount = computed(() => countNodes(filteredTree.value))

const stats = computed(() => {
  const total = todos.value.length
  const done = todos.value.filter((t) => t.status === 'done').length
  const today = todos.value.filter((t) => isToday(t.deadline)).length
  const upcoming = todos.value.filter((t) => isUpcoming(t.deadline)).length
  return {
    total,
    done,
    today,
    upcoming,
    todo: total - done
  }
})

const completion = computed(() => {
  if (!stats.value.total) return 0
  return Math.round((stats.value.done / stats.value.total) * 100)
})

const filters = computed(() => [
  { label: '今天', value: 'today', badge: stats.value.today },
  { label: '即将到期', value: 'upcoming', badge: stats.value.upcoming },
  { label: '全部', value: 'all', badge: stats.value.total },
  { label: '已完成', value: 'done', badge: stats.value.done }
])

const addTodo = async () => {
  const title = newTaskTitle.value.trim()
  if (!title || isAdding.value) return

  isAdding.value = true
  try {
    const deadline = newTaskDate.value ? new Date(newTaskDate.value).toISOString() : null
    const result = await todoStore.addTodo(title, {
      priority: Number(newTaskPriority.value),
      deadline
    })
    if (result.success) {
      newTaskTitle.value = ''
      newTaskDate.value = ''
      newTaskPriority.value = 1
    }
  } finally {
    isAdding.value = false
  }
}

const addSubtask = async (parentId, startEditCb) => {
  const result = await todoStore.addTodo('新子任务', { parent_id: parentId, priority: 0 })
  if (result.success && result.data) {
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
.tt-shell {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px 16px 48px;
  color: var(--color-text, #0f172a);
}

.tt-hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  padding: 20px 20px 16px;
  background: linear-gradient(135deg, #f8fafc, #eef2ff);
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}

.eyebrow {
  font-size: 0.85rem;
  color: #64748b;
  margin: 0 0 6px;
  letter-spacing: 0.5px;
}

.tt-hero h1 {
  margin: 0 0 8px;
  font-size: 2.2rem;
  color: #0f172a;
  letter-spacing: -0.5px;
}

.hero-meta {
  display: flex;
  gap: 12px;
  color: #475569;
  font-weight: 600;
  flex-wrap: wrap;
}

.hero-meta span {
  padding: 6px 10px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.progress-card {
  min-width: 220px;
  background: #0f172a;
  color: #e2e8f0;
  padding: 16px;
  border-radius: 14px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.3);
}

.progress-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.progress-bar {
  margin-top: 12px;
  height: 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #22d3ee, #4ade80);
  border-radius: 999px;
  transition: width 0.3s ease;
}

.tt-filters {
  margin-top: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.chip {
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #0f172a;
  padding: 8px 12px;
  border-radius: 999px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.chip.active {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
  box-shadow: 0 6px 18px rgba(37, 99, 235, 0.25);
}

.chip-count {
  background: rgba(255, 255, 255, 0.18);
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.85rem;
}

.filter-tools {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.input-with-icon {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  min-width: 240px;
}

.input-with-icon input {
  border: none;
  outline: none;
  width: 100%;
  font-size: 0.95rem;
  color: #0f172a;
}

.icon {
  opacity: 0.6;
}

.select {
  border: 1px solid #e2e8f0;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fff;
  font-weight: 600;
  color: #0f172a;
}

.tt-quick {
  margin-top: 16px;
  padding: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.quick-left {
  display: flex;
  gap: 10px;
  flex: 1;
  min-width: 320px;
}

.quick-left input[type='text'],
.quick-left input:not([type]),
.quick-left input[type='date'] {
  flex: 1;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 0.95rem;
}

.date-input {
  max-width: 160px;
}

.primary {
  background: linear-gradient(90deg, #2563eb, #4f46e5);
  color: #fff;
  border: none;
  padding: 10px 18px;
  border-radius: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.banner {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 10px;
  display: flex;
  gap: 8px;
  align-items: center;
  font-weight: 600;
}

.banner.error {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecdd3;
}

.banner.muted {
  background: #f8fafc;
  color: #475569;
  border: 1px dashed #cbd5e1;
}

.empty {
  margin-top: 28px;
  padding: 32px;
  text-align: center;
  border: 1px dashed #e2e8f0;
  border-radius: 12px;
  color: #475569;
  background: #f8fafc;
}

.empty-icon {
  font-size: 2.4rem;
  margin-bottom: 10px;
}

.tt-list {
  margin-top: 18px;
  list-style: none;
  padding: 0;
}

@media (max-width: 768px) {
  .tt-hero {
    flex-direction: column;
    align-items: flex-start;
  }

  .tt-filters {
    flex-direction: column;
    align-items: flex-start;
  }

  .filter-tools,
  .quick-left {
    width: 100%;
  }
}
</style>
