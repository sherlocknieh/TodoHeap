<template>
  <div v-if="show" data-detail-panel :class="[
    'relative max-w-full h-full min-h-0 bg-surface dark:bg-surface-dark flex flex-col z-20 border-l border-hairline dark:border-hairline-dark',
    // 已删除任务时整个面板显示禁用光标
    isDeleted ? 'cursor-not-allowed' : ''
  ]" :style="{ width: panelWidth + 'px' }">
    <!-- 左缘拖拽条：骑在面板边界线上，而非占据面板内侧；进入收起待命时加深提示 -->
    <div
      class="absolute inset-y-0 -left-1 z-40 w-2 cursor-col-resize touch-none transition-colors"
      :class="panelCollapseArmed ? 'bg-accent-700/60' : panelResizing ? 'bg-accent-500/50' : 'hover:bg-accent-500/30'"
      role="separator"
      aria-orientation="vertical"
      title="拖拽调整宽度，继续拖动即收起"
      @pointerdown="startResize"
    ></div>
    <!-- 面板关闭按钮（移动端/桌面端通用） -->
    <div class="shrink-0 h-12 flex items-center justify-between px-3 border-b border-hairline dark:border-hairline-dark">
      <span class="eyebrow">任务详情</span>
      <button type="button"
        class="p-1.5 -mr-1 rounded text-neutral-400 hover:bg-accent-50 hover:text-accent-800 dark:hover:bg-accent-500/10 dark:hover:text-accent-200 transition-colors"
        title="关闭" @click="emit('close')">
        <AppIcon name="close" :size="15" />
      </button>
    </div>
    <section class="flex-1 min-h-0 flex flex-col overflow-hidden">
      <!-- 空状态显示 -->
      <div v-if="!todo" class="flex-1 h-full flex items-center justify-center px-6 text-center text-neutral-400 dark:text-neutral-600">
        <div>
          <AppIcon name="fileText" :size="20" class="mx-auto mb-2" />
          <p class="text-sm text-neutral-500">选择一个任务查看详情</p>
        </div>
      </div>

      <template v-else>
        <!-- 区块1: 可编辑任务标题 -->
        <div class="shrink-0 px-4 pt-3 pb-3">
          <input v-model.trim="draftTitle" type="text" :disabled="isDeleted" :class="[
            'w-full px-0 py-1 text-lg font-semibold placeholder:text-neutral-300 dark:placeholder:text-neutral-700 bg-transparent border-none focus:outline-none focus:ring-0',
            isDeleted ? 'cursor-not-allowed text-neutral-400 dark:text-neutral-600' : 'text-neutral-800 dark:text-white'
          ]" placeholder="任务标题" @input="markDirty('title')" @blur="saveIfNeeded('title')" />
          <div class="mt-3 grid grid-cols-1 gap-2.5">
            <label class="text-[11px] text-neutral-500">
              截止时间
              <input
                v-model="draftDeadline"
                type="datetime-local"
                :disabled="isDeleted"
                class="field mt-1"
                @blur="saveDateField('deadline', draftDeadline)"
              />
            </label>
            <label class="text-[11px] text-neutral-500">
              难度(预计工时)
              <input
                v-model="draftDifficulty"
                type="number"
                step="0.25"
                min="0"
                :disabled="isDeleted"
                class="field mt-1"
                @blur="saveDifficultyField"
              />
            </label>
          </div>
        </div>

        <!-- 分割线 -->
        <div class="shrink-0 border-t border-hairline dark:border-hairline-dark"></div>

        <!-- 区块3: 任务描述 - Milkdown 编辑器（占满剩余空间） -->
        <!--
          说明: 这里使用 `flex-1 min-h-0 flex flex-col` 来确保外层提供一个真实的高度边界。
          在 flex 布局下，若子元素没有 `min-height: 0`，其默认的最小高度可能由内容撑开，
          导致 overflow 无法生效（看起来像“不能滚动”）。我们把滚动责任交给编辑器内部，
          编辑器（`.milkdown-editor`）通过 `height:100%` 与 `min-height:0` 在该边界内收缩并显示滚动条。
        -->
        <div class="flex-1 min-h-0 flex flex-col">
          <div :class="[
            'flex-1 min-h-0',
            isDeleted ? 'pointer-events-none deleted-content' : ''
          ]">
            <MilkdownEditor :key="editorKey" v-model="draftDetails" :readonly="isDeleted"
              placeholder="输入内容，支持 Markdown 语法..." class="h-full" @blur="handleDetailsBlur"
              @update:modelValue="onDetailsChange" />
          </div>
        </div>

        <!-- 区块4: 子任务，可新建或链接已有任务 -->
        <div class="shrink-0 border-t border-hairline dark:border-hairline-dark">
          <div class="px-4 pt-2 pb-1 flex items-center justify-between">
            <span class="eyebrow">子任务</span>
            <span class="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">{{ directChildren.length }}</span>
          </div>

          <div class="max-h-40 overflow-auto px-2 pb-1">
            <div v-for="child in directChildren" :key="child.id"
              class="group flex items-center gap-1 rounded-lg hover:bg-accent-50/70 dark:hover:bg-accent-500/[0.06] transition-colors">
              <button type="button"
                class="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm text-neutral-700 dark:text-neutral-300"
                @click="emit('task-selected', child.id)">
                <span class="h-1.5 w-1.5 rounded-full shrink-0"
                  :class="child.completed_at ? 'bg-accent-500 dark:bg-accent-400' : 'bg-neutral-300 dark:bg-neutral-600'"></span>
                <span class="flex-1 truncate"
                  :class="child.completed_at ? 'line-through text-neutral-400 dark:text-neutral-600' : ''">
                  {{ child.title || '未命名任务' }}
                </span>
              </button>
              <button v-if="!isDeleted" type="button"
                class="mr-1 grid h-6 w-6 shrink-0 place-items-center rounded text-neutral-400 opacity-0 transition-opacity hover:bg-accent-100 hover:text-accent-800 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:bg-accent-500/10 dark:hover:text-accent-200"
                title="取消链接" aria-label="取消链接" @click.stop="unlinkChild(child)">
                <AppIcon name="unlink" :size="13" />
              </button>
            </div>
            <p v-if="directChildren.length === 0" class="px-2 py-2 text-xs text-neutral-400 dark:text-neutral-600">
              还没有子任务
            </p>
          </div>

          <div v-if="!isDeleted" class="px-3 pb-3 pt-1 space-y-1.5">
            <div class="flex items-center gap-1.5">
              <input v-model.trim="newChildTitle" type="text" class="field flex-1 text-xs" placeholder="新建子任务"
                @keyup.enter="addChild" />
              <button type="button" :disabled="!newChildTitle.trim()"
                class="p-1.5 rounded text-neutral-500 hover:bg-accent-50 hover:text-accent-800 dark:hover:bg-accent-500/10 dark:hover:text-accent-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="添加子任务" @click="addChild">
                <AppIcon name="plus" :size="14" />
              </button>
            </div>
            <div class="flex items-center gap-1.5">
              <select v-model="linkTargetId" class="field flex-1 text-xs">
                <option value="">链接已有任务…</option>
                <option v-for="candidate in linkCandidates" :key="candidate.id" :value="candidate.id">
                  {{ candidate.title || '未命名任务' }}
                </option>
              </select>
              <button type="button" :disabled="!linkTargetId"
                class="p-1.5 rounded text-neutral-500 hover:bg-accent-50 hover:text-accent-800 dark:hover:bg-accent-500/10 dark:hover:text-accent-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="链接为子任务" @click="linkChild">
                <AppIcon name="link" :size="14" />
              </button>
            </div>
          </div>
        </div>
      </template>
    </section>
  </div>

</template>

<script setup>
import AppIcon from '@/components/AppIcon.vue'
import { computed, ref, watch, onUnmounted } from 'vue'
import { useTodoStore } from '@/stores/todos'
import { useSyncQueueStore } from '@/stores/syncQueue'
import MilkdownEditor from './MilkdownEditor.vue'
import { useResizablePanel } from '@/utils/resizablePanel'

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

const emit = defineEmits(['close', 'task-selected'])

const handleEscKey = (e) => {
  if (e.key === 'Escape') {
    closeExpandedEditor()
  }
}

const todoStore = useTodoStore()
const syncQueueStore = useSyncQueueStore()

// 为模板提供 `show` 绑定（确保模板中的 v-if="show" 可访问）
const show = computed(() => props.show)

// 面板左缘可拖拽调宽，拖过最小宽度后再拖一段即收起
const { width: panelWidth, resizing: panelResizing, collapseArmed: panelCollapseArmed, start: startResize } = useResizablePanel({
  key: 'detail-width',
  initial: 320,
  min: 260,
  side: 'right',
  onCollapse: () => emit('close')
})

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

// 只取当前任务的直接子任务，不递归展开更深层级
const directChildren = computed(() => {
  const ids = Array.isArray(todo.value?.child_ids) ? todo.value.child_ids : []
  return ids.map((id) => todoStore.findTodoById(id)).filter(Boolean)
})

// 可链接为子任务的任务：排除自身与已存在的子任务
const linkCandidates = computed(() => {
  if (!todo.value) return []
  const childIds = new Set((todo.value.child_ids || []).map(String))
  return todoStore.todos
    .filter((item) => String(item.id) !== String(todo.value.id) && !childIds.has(String(item.id)))
    .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')))
})

const newChildTitle = ref('')
const linkTargetId = ref('')

// 新建子任务后由 addTodo 把临时 ID 挂到当前任务的 child_ids
const addChild = async () => {
  const title = newChildTitle.value.trim()
  if (!title || !todo.value || isDeleted.value) return
  await todoStore.addTodo(title, { parent_id: todo.value.id })
  newChildTitle.value = ''
}

// 链接已有任务：把目标 ID 并入当前任务的 child_ids，形成多父关系
const linkChild = async () => {
  if (!linkTargetId.value || !todo.value || isDeleted.value) return
  const target = linkCandidates.value.find((item) => String(item.id) === String(linkTargetId.value))
  if (!target) return

  const nextIds = [...(todo.value.child_ids || []), target.id]
  await todoStore.updateTodo(todo.value.id, { child_ids: nextIds })
  linkTargetId.value = ''
}

// 取消链接：只从当前任务的 child_ids 移除引用，子任务本身与其他父关系不受影响
const unlinkChild = async (child) => {
  if (!todo.value || isDeleted.value) return
  const nextIds = (todo.value.child_ids || []).filter((id) => String(id) !== String(child.id))
  await todoStore.updateTodo(todo.value.id, { child_ids: nextIds })
}

// 格式化日期
const formatDate = (dateStr) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString('zh-CN')
}

const draftTitle = ref('')
const draftDetails = ref('')
const draftDeadline = ref('')
const draftDifficulty = ref('')

const initialTitle = ref('')
const initialDetails = ref('')

const dirtyTitle = ref(false)
const dirtyDetails = ref(false)

const lastSavedAt = ref('')

// Milkdown 编辑器相关
const editorKey = ref(0)

let debounceTimer = null
const debouncedSaveDetails = debounce(async () => {
  if (!todo.value || isDeleted.value) return
  markDirty('details')
  if (!dirtyDetails.value) return
  await savePayload({ details: draftDetails.value })
}, 500)

// 处理描述内容变化
const onDetailsChange = (value) => {
  draftDetails.value = value
  markDirty('details')
  // 触发防抖保存
  debouncedSaveDetails()
}

// 处理描述区域失焦 - 立即保存（取消防抖等待）
const handleDetailsBlur = async () => {
  // 取消防抖定时器，立即保存
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  await saveIfNeeded('details')
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

    if (payload.details !== undefined) {
      initialDetails.value = payload.details
      draftDetails.value = payload.details
      dirtyDetails.value = false
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
    draftDetails.value = ''
    draftDeadline.value = ''
    draftDifficulty.value = ''
    initialTitle.value = ''
    initialDetails.value = ''
    dirtyTitle.value = false
    dirtyDetails.value = false
    lastSavedAt.value = ''
    editorKey.value++ // 强制重新创建编辑器
    return
  }

  initialTitle.value = todo.value.title || ''
  initialDetails.value = todo.value.details || ''
  draftTitle.value = initialTitle.value
  draftDetails.value = initialDetails.value
  draftDeadline.value = toDateTimeLocal(todo.value.deadline)
  draftDifficulty.value = todo.value.difficulty == null ? '' : String(todo.value.difficulty)

  dirtyTitle.value = false
  dirtyDetails.value = false
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
    if (!dirtyDetails.value && newTodo.details !== draftDetails.value) {
      draftDetails.value = newTodo.details || ''
      initialDetails.value = newTodo.details || ''
      editorKey.value++ // 强制刷新编辑器
    }

    const nextDeadline = toDateTimeLocal(newTodo.deadline)
    if (nextDeadline !== draftDeadline.value) {
      draftDeadline.value = nextDeadline
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
    dirtyDetails.value = draftDetails.value !== initialDetails.value
  }
}

// 计算属性：是否有未保存的更改
const isDirty = computed(() => dirtyTitle.value || dirtyDetails.value)



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
  markDirty('details')
  if (!dirtyDetails.value) return
  await savePayload({ details: draftDetails.value })
}




</script>
