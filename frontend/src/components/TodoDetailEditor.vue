<template>
  <Transition enter-active-class="transition-all duration-300 ease-out" enter-from-class="translate-x-full" enter-to-class="translate-x-0" leave-active-class="transition-all duration-200 ease-in" leave-from-class="translate-x-0" leave-to-class="translate-x-full">
    <div v-if="show" data-detail-panel :class="[
      // 小屏浮层
      'absolute top-0 right-0 bottom-0 w-80 max-w-[85vw] bg-white shadow-2xl flex flex-col z-20',
      // 大屏常驻右栏
      'lg:static lg:flex lg:w-96 lg:max-w-none lg:shadow-none lg:border-l lg:border-slate-200 lg:z-10',
      // 大屏显示
      'lg:block'
    ]">
      <section class="h-full flex flex-col min-h-0">
        <!-- 空状态显示 -->
        <div v-if="!todo" class="flex-1 h-full flex items-center justify-center text-slate-400">
          <div class="text-center">
            <p class="text-4xl mb-2">📝</p>
            <p class="text-sm">选择一个任务查看详情</p>
          </div>
        </div>

        <template v-else>
          <!-- 已删除任务提示 -->
          <div v-if="isDeleted" class="shrink-0 mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            此任务已删除，仅可查看，不可编辑。若需编辑，请先恢复任务。
          </div>
          
          <!-- 区块1: 可编辑任务标题 -->
          <div class="shrink-0 px-4 pt-4 pb-3">
            <input
              v-model.trim="draftTitle"
              type="text"
              :disabled="isDeleted"
              :class="[
                'w-full px-0 py-1 text-xl font-bold text-slate-800 placeholder:text-slate-300 bg-transparent border-none focus:outline-none focus:ring-0',
                isDeleted ? 'cursor-not-allowed opacity-75' : ''
              ]"
              placeholder="任务标题"
              @input="markDirty('title')"
              @blur="saveIfNeeded('title')"
            />
          </div>
          
          <!-- 分割线 -->
          <div class="shrink-0 border-t border-slate-200"></div>
          
          <!-- 区块2: 功能键区 -->
          <div class="shrink-0 px-4 py-2.5 flex items-center justify-between">
            <div class="flex items-center gap-3 text-xs text-slate-500">
              <span v-if="isDeleted && todo.deleted_at" class="flex items-center gap-1">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                {{ formatDate(todo.deleted_at) }}
              </span>
              <span v-else-if="lastSavedAt" class="flex items-center gap-1 text-emerald-600">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                已保存
              </span>
              <span v-else class="text-slate-400">编辑中...</span>
            </div>
            <div class="flex items-center gap-1">
              <!-- 占位按钮 -->
              <button
                class="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-md transition-colors"
                title="更多操作"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="1" fill="currentColor" />
                  <circle cx="19" cy="12" r="1" fill="currentColor" />
                  <circle cx="5" cy="12" r="1" fill="currentColor" />
                </svg>
              </button>
            </div>
          </div>
          
          <!-- 分割线 -->
          <div class="shrink-0 border-t border-slate-200"></div>
          
          <!-- 区块3: 任务描述 - Milkdown 编辑器（占满剩余空间） -->
          <div class="flex-1 min-h-0 overflow-hidden">
            <div
              :class="[
                'h-full bg-white',
                isDeleted ? 'opacity-60' : ''
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
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useTodoStore } from '../stores/todos'
import { useSyncQueueStore } from '../stores/syncQueue'
import MilkdownEditor from './MilkdownEditor.vue'

const props = defineProps({
  todoId: { type: Number, default: null },
  show: { type: Boolean, default: false }
})

const emit = defineEmits(['close'])

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

// 处理描述内容变化
const onDescriptionChange = (value) => {
  draftDescription.value = value
  markDirty('description')
}

// 处理描述区域失焦
const handleDescriptionBlur = async () => {
  await saveIfNeeded('description')
}

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
