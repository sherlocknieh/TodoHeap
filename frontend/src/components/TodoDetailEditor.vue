<template>
  <section class="h-full flex flex-col min-h-0">
    <!-- 头部 -->
    <header class="shrink-0 px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <h2 class="text-lg font-semibold text-slate-900 truncate">{{ todo?.title || '任务详情' }}</h2>
      </div>
      <!-- 关闭按钮 -->
      <button
        @click="$emit('close')"
        class="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
        title="关闭详情面板"
      >
        <span class="text-lg">✕</span>
      </button>
    </header>
    
    <!-- 空状态显示 -->
    <div v-if="!todo" class="flex-1 h-full flex items-center justify-center text-slate-400">
      <div class="text-center">
        <p class="text-4xl mb-2">📝</p>
        <p class="text-sm">选择一个任务查看详情</p>
      </div>
    </div>

    <div v-else class="flex-1 min-h-0 overflow-auto px-4 py-4 space-y-4">
      <!-- 已删除任务提示 -->
      <div v-if="isDeleted" class="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
        此任务已删除，仅可查看，不可编辑。若需编辑，请先恢复任务。
      </div>
      <!-- 任务标题 -->
      <div class="space-y-1">
        <label class="block text-xs font-medium text-slate-600">标题</label>
        <input
          v-model.trim="draftTitle"
          type="text"
          :disabled="isDeleted"
          :class="[
            'w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500',
            isDeleted ? 'bg-slate-50 cursor-not-allowed opacity-75' : ''
          ]"
          placeholder="请输入标题"
          @input="markDirty('title')"
          @blur="saveIfNeeded('title')"
        />
      </div>
      <!-- 任务描述 -->
      <div class="space-y-1">
        <label class="block text-xs font-medium text-slate-600">详情</label>
        <textarea
          v-model="draftDescription"
          :disabled="isDeleted"
          :class="[
            'w-full min-h-48 px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500',
            isDeleted ? 'bg-slate-50 cursor-not-allowed opacity-75' : ''
          ]"
          placeholder="添加备注（失焦自动保存）"
          @input="markDirty('description')"
          @blur="saveIfNeeded('description')"
        ></textarea>
      </div>
      <!-- 最后保存时间 -->
      <div class="text-xs text-slate-500">
        <span v-if="isDeleted && todo.deleted_at">删除时间：{{ formatDate(todo.deleted_at) }}</span>
        <span v-else-if="lastSavedAt">最后保存：{{ lastSavedAt }}</span>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useTodoStore } from '../stores/todos'
import { useSyncQueueStore } from '../stores/syncQueue'

const props = defineProps({
  todoId: {
    type: Number,
    default: null
  }
})

const emit = defineEmits(['close'])

const todoStore = useTodoStore()
const syncQueueStore = useSyncQueueStore()

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

let clearSavedTimer = null

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
    return
  }

  initialTitle.value = todo.value.title || ''
  initialDescription.value = todo.value.description || ''
  draftTitle.value = initialTitle.value
  draftDescription.value = initialDescription.value

  dirtyTitle.value = false
  dirtyDescription.value = false
}

watch(
  () => props.todoId,
  () => {
    resetDraftFromTodo()
  },
  { immediate: true }
)

const markDirty = (field) => {
  if (field === 'title') {
    dirtyTitle.value = draftTitle.value !== initialTitle.value
  } else {
    dirtyDescription.value = draftDescription.value !== initialDescription.value
  }
}



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
