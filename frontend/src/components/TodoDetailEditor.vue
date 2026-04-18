<template>
  <Transition
    enter-active-class="transition-all duration-300 ease-out"
    enter-from-class="translate-x-full"
    enter-to-class="translate-x-0"
    leave-active-class="transition-all duration-200 ease-in"
    leave-from-class="translate-x-0"
    leave-to-class="translate-x-full"
  >
    <div v-if="show" data-detail-panel :class="[
      'fixed inset-y-0 right-0 w-80 max-w-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col z-20 border-l border-slate-200 dark:border-slate-700',
      // 已删除任务时整个面板显示禁用光标
      isDeleted ? 'cursor-not-allowed' : ''
    ]">
      <!-- 面板关闭按钮（移动端/桌面端通用） -->
      <div class="shrink-0 flex justify-end px-4 py-2">
        <button
          type="button"
          class="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          title="关闭"
          @click="emit('close')"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <section class="h-full flex flex-col min-h-0">
        <!-- 空状态显示 -->
        <div v-if="!todo" class="flex-1 h-full flex items-center justify-center text-slate-400 dark:text-slate-500">
          <div class="text-center">
            <p class="text-4xl mb-2">📝</p>
            <p class="text-sm">选择一个任务查看详情</p>
          </div>
        </div>

        <template v-else>
          <!-- 区块1: 可编辑任务标题 -->
          <div class="shrink-0 px-4 pt-4 pb-3">
            <input
              v-model.trim="draftTitle"
              type="text"
              :disabled="isDeleted"
              :class="[
                'w-full px-0 py-1 text-xl font-bold placeholder:text-slate-300 dark:placeholder:text-slate-600 bg-transparent border-none focus:outline-none focus:ring-0',
                isDeleted ? 'cursor-not-allowed text-slate-400 dark:text-slate-600' : 'text-slate-800 dark:text-white'
              ]"
              placeholder="任务标题"
              @input="markDirty('title')"
              @blur="saveIfNeeded('title')"
            />
          </div>
          
          <!-- 分割线 -->
          <div class="shrink-0 border-t border-slate-200 dark:border-slate-700"></div>
          
          <!-- 区块2: 功能键区 -->
          <div class="shrink-0 px-4 py-2.5 flex items-center justify-between">
            <div class="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span v-if="isDeleted && todo.deleted_at" class="flex items-center gap-1 text-slate-400 dark:text-slate-500">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                删除于 {{ formatDate(todo.deleted_at) }}
              </span>
              <span v-else-if="isDirty" class="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                <!-- <svg class="w-3.5 h-3.5 animate-pulse" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" />
                </svg> -->
                编辑中...
              </span>
              <span v-else-if="lastSavedAt" class="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                <!-- <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg> -->
                已保存
              </span>
              <span v-else class="text-slate-400 dark:text-slate-600">就绪</span>
            </div>
            <div class="flex items-center gap-1">
              <!-- 放大编辑按钮 -->
              <button
                @click="openExpandedEditor"
                class="p-1.5 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                title="放大编辑"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </button>
            </div>
          </div>
          
          <!-- 分割线 -->
          <div class="shrink-0 border-t border-slate-200 dark:border-slate-700"></div>
          
          <!-- 区块3: 任务描述 - Milkdown 编辑器（占满剩余空间） -->
          <div class="flex-1 min-h-0 overflow-hidden">
            <div
              :class="[
                'h-full bg-white dark:bg-slate-900',
                isDeleted ? 'pointer-events-none deleted-content' : ''
              ]"
            >
              <MilkdownEditor
                :key="editorKey"
                v-model="draftDescription"
                :readonly="isDeleted"
                placeholder="输入内容，支持 Markdown 语法..."
                class="h-full"
                @blur="handleDescriptionBlur"
                @update:modelValue="onDescriptionChange"
              />
            </div>
          </div>
        </template>
      </section>
    </div>
  </Transition>
  
  <!-- 放大编辑模态框 - 始终居中漂浮 -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showExpandedEditor"
        class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 lg:p-8"
        @click.self="closeExpandedEditor"
      >
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          enter-from-class="opacity-0 scale-95"
          enter-to-class="opacity-100 scale-100"
          leave-active-class="transition-all duration-150 ease-in"
          leave-from-class="opacity-100 scale-100"
          leave-to-class="opacity-0 scale-95"
        >
          <div
            v-if="showExpandedEditor"
            class="bg-white dark:bg-slate-900 shadow-2xl flex flex-col overflow-hidden w-full max-w-4xl h-[85vh] lg:h-[80vh] rounded-xl"
          >
            <!-- 模态框头部 -->
            <div class="shrink-0 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <input
                v-model.trim="draftTitle"
                type="text"
                :disabled="isDeleted"
                :class="[
                  'flex-1 px-0 py-1 text-2xl font-bold placeholder:text-slate-300 bg-transparent border-none focus:outline-none focus:ring-0',
                  isDeleted ? 'cursor-not-allowed text-slate-400' : 'text-slate-800'
                ]"
                placeholder="任务标题"
                @input="markDirty('title')"
                @blur="saveIfNeeded('title')"
              />
              <button
                @click="closeExpandedEditor"
                class="ml-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                title="关闭"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <!-- 模态框状态栏 -->
            <div class="shrink-0 px-6 py-2 border-b border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <div class="flex items-center gap-3">
                <span v-if="isDeleted && todo.deleted_at" class="flex items-center gap-1 text-slate-400">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  删除于 {{ formatDate(todo.deleted_at) }}
                </span>
                <span v-else-if="isDirty" class="text-slate-500">编辑中...</span>
                <span v-else-if="lastSavedAt" class="text-slate-500">已保存</span>
                <span v-else class="text-slate-400">就绪</span>
              </div>
              <span class="text-slate-400">按 ESC 关闭</span>
            </div>
            
            <!-- 模态框内容 - Milkdown 编辑器 -->
            <div class="flex-1 min-h-0 overflow-hidden">
              <div
                :class="[
                  'h-full bg-white',
                  isDeleted ? 'pointer-events-none deleted-content' : ''
                ]"
              >
                <MilkdownEditor
                  :key="'expanded-' + editorKey"
                  v-model="draftDescription"
                  :readonly="isDeleted"
                  placeholder="输入内容，支持 Markdown 语法..."
                  class="h-full"
                  @blur="handleDescriptionBlur"
                  @update:modelValue="onDescriptionChange"
                />
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch, onUnmounted } from 'vue'
import { useTodoStore } from '@/stores/todos'
import { useSyncQueueStore } from '@/stores/syncQueue'
import MilkdownEditor from './MilkdownEditor.vue'

// 防抖函数
function debounce(fn, delay) {
  let timer = null
  return function (...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      fn.apply(this, args)
      timer = null
    }, delay)
  }
}

const props = defineProps({
  todoId: { type: Number, default: null },
  show: { type: Boolean, default: false }
})

const emit = defineEmits(['close'])

// 放大编辑器状态
const showExpandedEditor = ref(false)

const openExpandedEditor = () => {
  showExpandedEditor.value = true
  // 添加 ESC 键监听
  document.addEventListener('keydown', handleEscKey)
}

const closeExpandedEditor = () => {
  showExpandedEditor.value = false
  // 移除 ESC 键监听
  document.removeEventListener('keydown', handleEscKey)
  // 强制刷新侧栏编辑器以显示最新内容
  editorKey.value++
}

const handleEscKey = (e) => {
  if (e.key === 'Escape') {
    closeExpandedEditor()
  }
}

const todoStore = useTodoStore()
const syncQueueStore = useSyncQueueStore()

// 为模板提供 `show` 绑定（确保模板中的 v-if="show" 可访问）
const show = computed(() => props.show)

// 同时从正常列表和垃圾箱中查找任务
const todo = computed(() => {
  if (!props.todoId) return null
  // 使用 store 的辅助方法查找（支持临时ID）
  const normalTodo = todoStore.findTodoById(props.todoId)
  if (normalTodo) return normalTodo
  // 再从垃圾箱查找
  return todoStore.trashTodos.find(t => t.id === props.todoId) || null
})

// 判断是否是已删除的任务
const isDeleted = computed(() => {
  return todo.value?.deleted_at != null
})

// 格式化日期
const formatDate = (dateStr) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString('zh-CN')
}

const draftTitle = ref('')
const draftDescription = ref('')

const initialTitle = ref('')
const initialDescription = ref('')

const dirtyTitle = ref(false)
const dirtyDescription = ref(false)

const lastSavedAt = ref('')

// Milkdown 编辑器相关
const editorKey = ref(0)

let debounceTimer = null
const debouncedSaveDescription = debounce(async () => {
  if (!todo.value || isDeleted.value) return
  markDirty('description')
  if (!dirtyDescription.value) return
  await savePayload({ description: draftDescription.value })
}, 500)

// 处理描述内容变化
const onDescriptionChange = (value) => {
  draftDescription.value = value
  markDirty('description')
  // 触发防抖保存
  debouncedSaveDescription()
}

// 处理描述区域失焦 - 立即保存（取消防抖等待）
const handleDescriptionBlur = async () => {
  // 取消防抖定时器，立即保存
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  await saveIfNeeded('description')
}

let clearSavedTimer = null

// 组件卸载时清理定时器和事件监听
onUnmounted(() => {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
  if (clearSavedTimer) {
    clearTimeout(clearSavedTimer)
  }
})

// 乐观更新的保存方法
const savePayload = async (payload) => {
  if (!todo.value) return

  try {
    // 使用 todoStore 的乐观更新方法
    const result = await todoStore.updateTodo(props.todoId, payload)
    
    if (!result.success) {
      throw new Error(result.error || '保存失败')
    }

    // 乐观更新成功，更新本地状态
    if (payload.title !== undefined) {
      initialTitle.value = payload.title
      draftTitle.value = payload.title
      dirtyTitle.value = false
    }

    if (payload.description !== undefined) {
      initialDescription.value = payload.description
      draftDescription.value = payload.description
      dirtyDescription.value = false
    }

    lastSavedAt.value = new Date().toLocaleString()
  } catch (e) {

  }
}

const resetDraftFromTodo = () => {
  if (!todo.value) {
    draftTitle.value = ''
    draftDescription.value = ''
    initialTitle.value = ''
    initialDescription.value = ''
    dirtyTitle.value = false
    dirtyDescription.value = false
    lastSavedAt.value = ''
    editorKey.value++ // 强制重新创建编辑器
    return
  }

  initialTitle.value = todo.value.title || ''
  initialDescription.value = todo.value.description || ''
  draftTitle.value = initialTitle.value
  draftDescription.value = initialDescription.value

  dirtyTitle.value = false
  dirtyDescription.value = false
  editorKey.value++ // 强制重新创建编辑器以加载新内容
}

watch(
  () => props.todoId,
  () => {
    resetDraftFromTodo()
  },
  { immediate: true }
)

// 监听远程更新：当 todo 数据变化时，如果不是用户正在编辑，则同步更新
watch(
  () => todo.value,
  (newTodo, oldTodo) => {
    if (!newTodo) return
    // 如果 todoId 改变了，resetDraftFromTodo 已经处理了
    if (oldTodo && newTodo.id !== oldTodo.id) return
    
    // 如果用户没有在编辑，同步远程更新
    if (!dirtyTitle.value && newTodo.title !== draftTitle.value) {
      draftTitle.value = newTodo.title || ''
      initialTitle.value = newTodo.title || ''
    }
    if (!dirtyDescription.value && newTodo.description !== draftDescription.value) {
      draftDescription.value = newTodo.description || ''
      initialDescription.value = newTodo.description || ''
      editorKey.value++ // 强制刷新编辑器
    }
  },
  { deep: true }
)

const markDirty = (field) => {
  if (field === 'title') {
    dirtyTitle.value = draftTitle.value !== initialTitle.value
  } else {
    dirtyDescription.value = draftDescription.value !== initialDescription.value
  }
}

// 计算属性：是否有未保存的更改
const isDirty = computed(() => dirtyTitle.value || dirtyDescription.value)



const saveIfNeeded = async (field) => {
  if (!todo.value) return
  // 已删除的任务不允许保存
  if (isDeleted.value) return
  if (field === 'title') {
    markDirty('title')
    if (!dirtyTitle.value) return
    await savePayload({ title: draftTitle.value })
    return
  }
  markDirty('description')
  if (!dirtyDescription.value) return
  await savePayload({ description: draftDescription.value })
}




</script>
