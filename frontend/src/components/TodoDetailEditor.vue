<template>
  <div v-if="show" data-detail-panel :class="[
    'w-80 max-w-full h-full min-h-0 overflow-hidden bg-white dark:bg-slate-900 shadow-2xl flex flex-col z-20 border-l border-slate-200 dark:border-slate-700',
    // 已删除任务时整个面板显示禁用光标
    isDeleted ? 'cursor-not-allowed' : ''
  ]">
    <!-- 面板关闭按钮（移动端/桌面端通用） -->
    <div class="shrink-0 flex justify-end px-4 py-2">
      <button type="button"
        class="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
        title="关闭" @click="emit('close')">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
    <section class="flex-1 min-h-0 flex flex-col">
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
          <input v-model.trim="draftTitle" type="text" :disabled="isDeleted" :class="[
            'w-full px-0 py-1 text-xl font-bold placeholder:text-slate-300 dark:placeholder:text-slate-600 bg-transparent border-none focus:outline-none focus:ring-0',
            isDeleted ? 'cursor-not-allowed text-slate-400 dark:text-slate-600' : 'text-slate-800 dark:text-white'
          ]" placeholder="任务标题" @input="markDirty('title')" @blur="saveIfNeeded('title')" />
          <div class="mt-3 grid grid-cols-1 gap-2">
            <label class="text-xs text-slate-500 dark:text-slate-400">
              开始时间
              <input
                v-model="draftStartDate"
                type="datetime-local"
                :disabled="isDeleted"
                class="mt-1 w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm text-slate-700 dark:text-slate-200"
                @blur="saveDateField('start_date', draftStartDate)"
              />
            </label>
            <label class="text-xs text-slate-500 dark:text-slate-400">
              截止时间
              <input
                v-model="draftDeadline"
                type="datetime-local"
                :disabled="isDeleted"
                class="mt-1 w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm text-slate-700 dark:text-slate-200"
                @blur="saveDateField('deadline', draftDeadline)"
              />
            </label>
            <label class="text-xs text-slate-500 dark:text-slate-400">
              难度(预计工时)
              <input
                v-model="draftDifficulty"
                type="number"
                step="0.25"
                min="0"
                :disabled="isDeleted"
                class="mt-1 w-full rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-sm text-slate-700 dark:text-slate-200"
                @blur="saveDifficultyField"
              />
            </label>
          </div>
        </div>

        <!-- 分割线 -->
        <div class="shrink-0 border-t border-slate-200 dark:border-slate-700"></div>

        <!-- 区块3: 任务描述 - Milkdown 编辑器（占满剩余空间） -->
        <!--
          说明: 这里使用 `flex-1 min-h-0 flex flex-col` 来确保外层提供一个真实的高度边界。
          在 flex 布局下，若子元素没有 `min-height: 0`，其默认的最小高度可能由内容撑开，
          导致 overflow 无法生效（看起来像“不能滚动”）。我们把滚动责任交给编辑器内部，
          编辑器（`.milkdown-editor`）通过 `height:100%` 与 `min-height:0` 在该边界内收缩并显示滚动条。
        -->
        <div class="flex-1 min-h-0 flex flex-col">
          <div :class="[
            'flex-1 min-h-0 bg-white dark:bg-slate-900',
            isDeleted ? 'pointer-events-none deleted-content' : ''
          ]">
            <MilkdownEditor :key="editorKey" v-model="draftDescription" :readonly="isDeleted"
              placeholder="输入内容，支持 Markdown 语法..." class="h-full" @blur="handleDescriptionBlur"
              @update:modelValue="onDescriptionChange" />
          </div>
        </div>
      </template>
    </section>
  </div>

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
const draftDeadline = ref('')
const draftStartDate = ref('')
const draftDifficulty = ref('')

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

const toDateTimeLocal = (value) => {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const toIsoOrNull = (value) => {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

const saveDateField = async (field, localValue) => {
  if (!todo.value || isDeleted.value) return
  const next = toIsoOrNull(localValue)
  const current = todo.value[field] || null
  if (next === current) return
  await savePayload({ [field]: next })
}

const saveDifficultyField = async () => {
  if (!todo.value || isDeleted.value) return
  const text = String(draftDifficulty.value || '').trim()
  const next = text === '' ? null : Number(text)
  if (next !== null && !Number.isFinite(next)) return
  const current = todo.value.difficulty == null ? null : Number(todo.value.difficulty)
  if (next === current) return
  await savePayload({ difficulty: next })
}

const resetDraftFromTodo = () => {
  if (!todo.value) {
    draftTitle.value = ''
    draftDescription.value = ''
    draftDeadline.value = ''
    draftStartDate.value = ''
    draftDifficulty.value = ''
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
  draftDeadline.value = toDateTimeLocal(todo.value.deadline)
  draftStartDate.value = toDateTimeLocal(todo.value.start_date)
  draftDifficulty.value = todo.value.difficulty == null ? '' : String(todo.value.difficulty)

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

    const nextDeadline = toDateTimeLocal(newTodo.deadline)
    if (nextDeadline !== draftDeadline.value) {
      draftDeadline.value = nextDeadline
    }
    const nextStartDate = toDateTimeLocal(newTodo.start_date)
    if (nextStartDate !== draftStartDate.value) {
      draftStartDate.value = nextStartDate
    }
    const nextDifficulty = newTodo.difficulty == null ? '' : String(newTodo.difficulty)
    if (nextDifficulty !== draftDifficulty.value) {
      draftDifficulty.value = nextDifficulty
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
