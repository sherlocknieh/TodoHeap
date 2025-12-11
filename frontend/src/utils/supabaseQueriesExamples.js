/**
 * Supabase 视图查询在 Vue 组件中的使用示例
 */

// 示例 1: 在组件的 onMounted 中查询
import { onMounted, ref } from 'vue'
import { getTodosTree, getRootTodosWithProgress } from '@/utils/supabaseQueries'

export default {
  name: 'TodoListExample',
  setup() {
    const todos = ref([])
    const todosWithProgress = ref([])
    const loading = ref(false)

    // 加载任务树
    const loadTodosTree = async () => {
      loading.value = true
      try {
        todos.value = await getTodosTree()
      } catch (error) {
        console.error('加载任务树失败:', error)
      } finally {
        loading.value = false
      }
    }

    // 加载带进度的根任务
    const loadRootTodosWithProgress = async () => {
      loading.value = true
      try {
        todosWithProgress.value = await getRootTodosWithProgress()
      } catch (error) {
        console.error('加载根任务进度失败:', error)
      } finally {
        loading.value = false
      }
    }

    onMounted(() => {
      loadTodosTree()
      loadRootTodosWithProgress()
    })

    return {
      todos,
      todosWithProgress,
      loading
    }
  }
}

// ---------------------------------------------------

// 示例 2: Vuex Store 中集成视图查询
import {
  getActiveTodos,
  getRootTodos,
  getTodosWithProgress,
  getTodoProgress,
  subscribeToActiveTodos
} from '@/utils/supabaseQueries'

export const todosModule = {
  state() {
    return {
      todos: [],
      rootTodos: [],
      todosWithProgress: [],
      loading: false,
      error: null
    }
  },

  mutations: {
    SET_TODOS(state, todos) {
      state.todos = todos
    },
    SET_ROOT_TODOS(state, todos) {
      state.rootTodos = todos
    },
    SET_TODOS_WITH_PROGRESS(state, todos) {
      state.todosWithProgress = todos
    },
    SET_LOADING(state, loading) {
      state.loading = loading
    },
    SET_ERROR(state, error) {
      state.error = error
    },
    UPDATE_TODO(state, updatedTodo) {
      const index = state.todos.findIndex(t => t.id === updatedTodo.id)
      if (index !== -1) {
        state.todos[index] = updatedTodo
      }
    }
  },

  actions: {
    async fetchActiveTodos({ commit }) {
      commit('SET_LOADING', true)
      try {
        const todos = await getActiveTodos()
        commit('SET_TODOS', todos)
        commit('SET_ERROR', null)
      } catch (error) {
        commit('SET_ERROR', error.message)
        console.error('获取活跃任务失败:', error)
      } finally {
        commit('SET_LOADING', false)
      }
    },

    async fetchRootTodos({ commit }) {
      commit('SET_LOADING', true)
      try {
        const todos = await getRootTodos()
        commit('SET_ROOT_TODOS', todos)
        commit('SET_ERROR', null)
      } catch (error) {
        commit('SET_ERROR', error.message)
        console.error('获取根任务失败:', error)
      } finally {
        commit('SET_LOADING', false)
      }
    },

    async fetchTodosWithProgress({ commit }) {
      commit('SET_LOADING', true)
      try {
        const todos = await getTodosWithProgress()
        commit('SET_TODOS_WITH_PROGRESS', todos)
        commit('SET_ERROR', null)
      } catch (error) {
        commit('SET_ERROR', error.message)
        console.error('获取任务进度失败:', error)
      } finally {
        commit('SET_LOADING', false)
      }
    },

    // 订阅实时更新
    subscribeToChanges({ commit }) {
      return subscribeToActiveTodos((payload) => {
        if (payload.eventType === 'UPDATE') {
          commit('UPDATE_TODO', payload.new)
        } else if (payload.eventType === 'INSERT') {
          commit('SET_TODOS', [...this.state.todos, payload.new])
        }
      })
    }
  },

  getters: {
    getActiveTodos: (state) => state.todos,
    getRootTodos: (state) => state.rootTodos,
    getTodosWithProgress: (state) => state.todosWithProgress,
    getLoading: (state) => state.loading,
    getError: (state) => state.error,
    
    // 获取特定优先级的任务
    getHighPriorityTodos: (state) => (priority = 3) => {
      return state.todos.filter(t => t.priority >= priority && t.status !== 'done')
    },

    // 获取完成进度大于某个百分比的任务
    getTodosWithHighProgress: (state) => (percent = 50) => {
      return state.todosWithProgress.filter(t => t.progress_percent >= percent)
    }
  }
}

// ---------------------------------------------------

// 示例 3: 在模板中使用
const templateExample = `
<template>
  <div class="todo-container">
    <!-- 加载状态 -->
    <div v-if="loading" class="loading">加载中...</div>

    <!-- 错误提示 -->
    <div v-if="error" class="error">{{ error }}</div>

    <!-- 任务树显示 -->
    <div v-if="!loading && todos.length" class="todo-tree">
      <div v-for="todo in todos" :key="todo.id" :style="{ marginLeft: todo.depth * 20 + 'px' }">
        <h3>{{ todo.path_text }}</h3>
        <p>状态: {{ todo.status }} | 优先级: {{ todo.priority }}</p>
      </div>
    </div>

    <!-- 任务进度显示 -->
    <div v-if="todosWithProgress.length" class="progress-list">
      <div v-for="todo in todosWithProgress" :key="todo.id" class="progress-item">
        <span>{{ todo.title }}</span>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: todo.progress_percent + '%' }">
            {{ todo.progress_percent }}%
          </div>
        </div>
        <span class="progress-text">{{ todo.done_count }}/{{ todo.total_count }}</span>
      </div>
    </div>
  </div>
</template>

<script>
import { mapState, mapActions } from 'vuex'

export default {
  name: 'TodoView',
  computed: {
    ...mapState('todos', ['todos', 'todosWithProgress', 'loading', 'error'])
  },
  methods: {
    ...mapActions('todos', ['fetchActiveTodos', 'fetchTodosWithProgress'])
  },
  mounted() {
    this.fetchActiveTodos()
    this.fetchTodosWithProgress()
  }
}
</script>

<style scoped>
.todo-container {
  padding: 20px;
}

.loading, .error {
  padding: 10px;
  text-align: center;
}

.error {
  color: red;
  background-color: #ffeeee;
}

.progress-item {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px 0;
}

.progress-bar {
  flex: 1;
  height: 24px;
  background-color: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background-color: #4caf50;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 12px;
}

.progress-text {
  min-width: 50px;
  text-align: right;
  font-size: 12px;
}
</style>
`
