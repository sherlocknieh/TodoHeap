<template>
  <!-- 小屏：浮层动画，v-if 控制 -->
  <Transition
    enter-active-class="transition-all duration-300 ease-out"
    enter-from-class="-translate-x-full"
    enter-to-class="translate-x-0"
    leave-active-class="transition-all duration-200 ease-in"
    leave-from-class="translate-x-0"
    leave-to-class="-translate-x-full"
  >
    <div
      v-if="show"
      :class="[
        // 小屏浮层样式
        'absolute top-0 left-0 bottom-0 w-72 max-w-[85vw] bg-white shadow-2xl flex flex-col z-30',
        // 大屏常驻左栏样式
        'lg:static lg:flex lg:w-64 lg:max-w-none lg:shadow-none lg:border-r lg:border-slate-200 lg:z-10',
        // 大屏显示
        'lg:block'
      ]"
    >
      <section class="h-full flex flex-col min-h-0">
        <!-- 头部 -->
        <header class="shrink-0 px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <h2 class="text-lg font-semibold text-slate-900">📁 任务导航</h2>
          </div>
          <!-- 关闭按钮 -->
          <button
            @click="$emit('close')"
            class="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors lg:hidden"
            title="关闭侧栏"
          >
            <span class="text-lg">✕</span>
          </button>
        </header>

        <!-- 内容区域 -->
        <div class="flex-1 min-h-0 overflow-auto px-4 py-4 space-y-6">
          <!-- 视图切换 -->
          <div class="space-y-2">
            <h3 class="text-xs font-medium text-slate-600 uppercase tracking-wider">视图</h3>
            <div class="space-y-1">
              <button
                @click="switchView('list')"
                :class="[
                  'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2',
                  activeView === 'list' 
                    ? 'bg-indigo-50 text-indigo-700 font-medium' 
                    : 'text-slate-600 hover:bg-slate-50'
                ]"
              >
                <span>📋</span>
                <span>列表视图</span>
              </button>
              <button
                @click="switchView('tree')"
                :class="[
                  'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2',
                  activeView === 'tree' 
                    ? 'bg-indigo-50 text-indigo-700 font-medium' 
                    : 'text-slate-600 hover:bg-slate-50'
                ]"
              >
                <span>🌳</span>
                <span>树视图</span>
              </button>
              <button
                @click="switchView('heap')"
                :class="[
                  'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2',
                  activeView === 'heap' 
                    ? 'bg-indigo-50 text-indigo-700 font-medium' 
                    : 'text-slate-600 hover:bg-slate-50'
                ]"
              >
                <span>🏔️</span>
                <span>堆视图</span>
              </button>
              <button
                @click="switchView('trash')"
                :class="[
                  'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2',
                  activeView === 'trash' 
                    ? 'bg-red-50 text-red-700 font-medium' 
                    : 'text-slate-600 hover:bg-slate-50'
                ]"
              >
                <span>🗑️</span>
                <span>回收站</span>
              </button>
            </div>
          </div>

          <!-- 统计信息 -->
          <div class="space-y-2">
            <h3 class="text-xs font-medium text-slate-600 uppercase tracking-wider">统计</h3>
            <div class="bg-slate-50 rounded-lg p-3 space-y-2">
              <div class="flex justify-between text-sm">
                <span class="text-slate-600">总任务数</span>
                <span class="font-medium text-slate-900">{{ stats.total }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-slate-600">已完成</span>
                <span class="font-medium text-green-600">{{ stats.completed }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-slate-600">进行中</span>
                <span class="font-medium text-blue-600">{{ stats.pending }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-slate-600">已删除</span>
                <span class="font-medium text-red-600">{{ stats.trashed }}</span>
              </div>
            </div>
          </div>

          <!-- AI 任务分解 -->
          <div class="space-y-2">
            <h3 class="text-xs font-medium text-slate-600 uppercase tracking-wider">AI 智能助手</h3>
            <div class="space-y-1">
              <!-- AI 分解按钮 -->
              <button
                v-if="selectedTaskId"
                @click="breakdownTask"
                :disabled="isBreakingDown"
                :class="[
                  'w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-200 flex items-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed',
                  'bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700 shadow-sm hover:shadow-md',
                  !isBreakingDown && 'animate-pulse-glow'
                ]"
              >
                <span class="flex items-center justify-center">
                  <span v-if="isBreakingDown" class="animate-spin">⚡</span>
                  <span v-else class="text-base">🤖</span>
                </span>
                <span class="flex-1">{{ isBreakingDown ? 'AI正在分解...' : 'AI 智能分解' }}</span>
                <span v-if="!isBreakingDown" class="text-xs opacity-75 bg-white/20 px-2 py-0.5 rounded-full">AI</span>
              </button>
              
              <!-- 无选中任务时的提示 -->
              <div v-else class="text-center px-3 py-4 bg-slate-50 rounded-lg border border-slate-200">
                <div class="text-2xl mb-1">🤖</div>
                <p class="text-xs text-slate-500">请先选择一个任务</p>
                <p class="text-xs text-slate-400 mt-1">AI 将帮助分解复杂任务</p>
              </div>
            </div>
          </div>

        </div>

        <!-- 底部信息 -->
        <footer class="shrink-0 px-4 py-3 border-t border-slate-200">
          <div class="text-xs text-slate-500 text-center">
            TodoHeap v1.0
          </div>
        </footer>
      </section>
    </div>
  </Transition>
</template>

<script setup>
import { computed } from 'vue'
import { useTodoStore } from '../stores/todos'
import { storeToRefs } from 'pinia'

const props = defineProps({
  show: { type: Boolean, default: false },
  activeView: { type: String, default: 'list' },
  selectedTaskId: { type: Number, default: null },
  isBreakingDown: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'switch-view', 'create-task', 'breakdown-task'])

// 为模板提供 `show` 绑定
const show = computed(() => props.show)

const todoStore = useTodoStore()

// 统计信息
const stats = computed(() => ({
  total: todoStore.todos.length,
  completed: todoStore.todos.filter(todo => todo.completed).length,
  pending: todoStore.todos.filter(todo => !todo.completed).length,
  trashed: todoStore.trashTodos.length
}))

// 切换视图
const switchView = (view) => {
  emit('switch-view', view)
  // 小屏下切换视图后自动关闭侧栏
  if (window.innerWidth < 1024) {
    emit('close')
  }
}

// 创建新任务
const createNewTask = () => {
  emit('create-task')
  // 小屏下创建任务后自动关闭侧栏
  if (window.innerWidth < 1024) {
    emit('close')
  }
}

// 分解任务
const breakdownTask = () => {
  if (props.selectedTaskId) {
    emit('breakdown-task')
    // 小屏下分解任务后自动关闭侧栏
    if (window.innerWidth < 1024) {
      emit('close')
    }
  }
}
</script>

<style scoped>
/* AI 分解按钮动画 */
@keyframes pulse-glow {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(16, 185, 129, 0);
  }
}

.animate-pulse-glow {
  animation: pulse-glow 2s infinite;
}
</style>