<template>
  <section class="h-full flex flex-col min-h-0">
    <header class="shrink-0 px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
      <h3 class="text-sm font-semibold text-slate-900">任务详情</h3>
      <div class="flex items-center gap-2">
        <p
          v-if="statusText"
          aria-live="polite"
          :class="[
            'text-xs font-medium px-2 py-1 rounded-full',
            saveState === 'error'
              ? 'bg-red-50 text-red-700'
              : saveState === 'saving'
                ? 'bg-slate-100 text-slate-600'
                : 'bg-emerald-50 text-emerald-700'
          ]"
        >
          {{ statusText }}
        </p>
        <button
          v-if="saveState === 'error' && lastAttemptedPayload"
          type="button"
          class="text-xs font-medium text-indigo-600 hover:text-indigo-700"
          @click="retryLastSave"
        >
          重试
        </button>
      </div>
    </header>

    <div v-if="!todo" class="flex-1 flex items-center justify-center px-4">
      <div class="text-center text-sm text-slate-500">
        请选择一个任务查看详情
      </div>
    </div>

    <div v-else class="flex-1 min-h-0 overflow-auto px-4 py-4 space-y-4">
      <div class="space-y-1">
        <label class="block text-xs font-medium text-slate-600">标题</label>
        <input
          v-model.trim="draftTitle"
          type="text"
          class="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="请输入标题"
          @input="markDirty('title')"
          @blur="saveIfNeeded('title')"
        />
      </div>

      <div class="space-y-1">
        <label class="block text-xs font-medium text-slate-600">备注</label>
        <textarea
          v-model="draftDescription"
          class="w-full min-h-48 px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="添加备注（失焦自动保存）"
          @input="markDirty('description')"
          @blur="saveIfNeeded('description')"
        ></textarea>
      </div>

      <div class="text-xs text-slate-500">
        <span v-if="lastSavedAt">最后保存：{{ lastSavedAt }}</span>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { supabase } from '../supabase'
import { useTodoStore } from '../stores/todos'

const props = defineProps({
  todoId: {
    type: Number,
    default: null
  }
})

const todoStore = useTodoStore()

const todo = computed(() => {
  if (!props.todoId) return null
  return todoStore.todos.find(t => t.id === props.todoId) || null
})

const draftTitle = ref('')
const draftDescription = ref('')

const initialTitle = ref('')
const initialDescription = ref('')

const dirtyTitle = ref(false)
const dirtyDescription = ref(false)

const saveState = ref('idle') // idle | saving | saved | error
const lastErrorMessage = ref('')
const lastSavedAt = ref('')
const lastAttemptedPayload = ref(null)

let clearSavedTimer = null

const statusText = computed(() => {
  if (saveState.value === 'saving') return '保存中...'
  if (saveState.value === 'saved') return '已保存'
  if (saveState.value === 'error') return lastErrorMessage.value || '保存失败'
  return ''
})

const resetDraftFromTodo = () => {
  if (!todo.value) {
    draftTitle.value = ''
    draftDescription.value = ''
    initialTitle.value = ''
    initialDescription.value = ''
    dirtyTitle.value = false
    dirtyDescription.value = false
    saveState.value = 'idle'
    lastErrorMessage.value = ''
    lastSavedAt.value = ''
    lastAttemptedPayload.value = null
    return
  }

  initialTitle.value = todo.value.title || ''
  initialDescription.value = todo.value.description || ''
  draftTitle.value = initialTitle.value
  draftDescription.value = initialDescription.value

  dirtyTitle.value = false
  dirtyDescription.value = false
  saveState.value = 'idle'
  lastErrorMessage.value = ''
  lastAttemptedPayload.value = null
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

const setSavedStateTemporarily = () => {
  if (clearSavedTimer) {
    clearTimeout(clearSavedTimer)
    clearSavedTimer = null
  }
  saveState.value = 'saved'
  clearSavedTimer = setTimeout(() => {
    saveState.value = 'idle'
  }, 1500)
}

const updateTodoInStore = (updated) => {
  const idx = todoStore.todos.findIndex(t => t.id === updated.id)
  if (idx !== -1) {
    todoStore.todos[idx] = updated
  }
}

const savePayload = async (payload) => {
  if (!todo.value) return

  saveState.value = 'saving'
  lastErrorMessage.value = ''
  lastAttemptedPayload.value = payload

  try {
    const { data, error } = await supabase
      .from('todos')
      .update(payload)
      .eq('id', todo.value.id)
      .select('*')
      .single()

    if (error) throw error

    updateTodoInStore(data)

    if (payload.title !== undefined) {
      initialTitle.value = data.title || ''
      draftTitle.value = initialTitle.value
      dirtyTitle.value = false
    }

    if (payload.description !== undefined) {
      initialDescription.value = data.description || ''
      draftDescription.value = initialDescription.value
      dirtyDescription.value = false
    }

    lastSavedAt.value = new Date().toLocaleString()
    setSavedStateTemporarily()
  } catch (e) {
    saveState.value = 'error'
    lastErrorMessage.value = e?.message || '保存失败'
  }
}

const saveIfNeeded = async (field) => {
  if (!todo.value) return

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

const retryLastSave = async () => {
  if (!todo.value || !lastAttemptedPayload.value) return
  await savePayload(lastAttemptedPayload.value)
}

onBeforeUnmount(() => {
  if (clearSavedTimer) {
    clearTimeout(clearSavedTimer)
    clearSavedTimer = null
  }
})
</script>
