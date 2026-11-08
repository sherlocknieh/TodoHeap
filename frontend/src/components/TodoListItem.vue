<template>
  <ul class="divide-y divide-hairline dark:divide-hairline-dark">
    <template v-for="item in flatList">
      <li v-if="isItemVisible(item)" :key="item.id" data-task-item :class="[
        'group flex items-center gap-2 py-1.5 pr-2 cursor-pointer border-l-2 transition-colors',
        selectedTaskId === (item._isRef ? item._refTargetId : item.id)
          ? 'bg-accent-50 dark:bg-accent-500/10 border-accent-500 dark:border-accent-400'
          : 'border-transparent hover:bg-accent-50/70 dark:hover:bg-accent-500/[0.06]'
      ]" :style="{ paddingLeft: (6 + item._level * 18) + 'px' }" @click="selectTask(item)">
        <!-- 展开/折叠 -->
        <button v-if="item.children && item.children.length"
          class="p-0.5 rounded text-neutral-400 hover:text-accent-700 dark:hover:text-accent-300 transition-colors"
          @click.stop="toggleExpand(item.id)">
          <AppIcon :name="expandedMap[item.id] ? 'chevronDown' : 'chevronRight'" :size="13" />
        </button>
        <span v-else class="w-[17px] shrink-0"></span>

        <!-- 完成状态 -->
        <button v-if="!item._isRef" type="button"
          class="shrink-0 grid place-items-center w-[15px] h-[15px] rounded-[3px] border transition-colors"
          :class="statusMap[item.id] === 'checked'
            ? 'bg-accent-600 border-accent-600 text-white dark:bg-accent-400 dark:border-accent-400 dark:text-accent-950'
            : 'border-neutral-400 text-transparent hover:border-neutral-500 dark:border-neutral-500 dark:hover:border-neutral-400'"
          :aria-pressed="statusMap[item.id] === 'checked'" @click.stop="cycleStatus(item)">
          <AppIcon name="check" :size="10" />
        </button>
        <span v-else class="w-[15px] shrink-0"></span>

        <!-- 标题与元信息 -->
        <div class="flex-1 min-w-0">
          <span v-if="editingId !== item.id" :class="[
            'block text-sm leading-6 text-neutral-800 dark:text-neutral-200 break-words',
            { 'line-through text-neutral-400 dark:text-neutral-600': item.completed_at && !item._isRef }
          ]" @dblclick.stop="item._isRef ? null : startEdit(item.id, item.title)">
            <AppIcon v-if="item._isRef" name="link" :size="11"
              class="inline-block mr-1 -mt-0.5 text-neutral-400 dark:text-neutral-500" />
            <span :class="{ 'text-neutral-400 dark:text-neutral-500': item._isRef }">{{ item.title || '未命名任务' }}</span>
          </span>
          <input v-else :id="'edit-input-' + item.id" v-model="editingText"
            class="w-full bg-transparent text-sm leading-6 text-neutral-900 dark:text-neutral-100 outline-none border-b border-accent-600 dark:border-accent-400"
            @blur="finishEdit(item.id, 'blur')" @keyup.enter="finishEdit(item.id, 'enter')"
            @keyup.esc="editingId = null" />

          <div v-if="editingId !== item.id && (item.deadline || item.difficulty != null)"
            class="mt-1 flex flex-wrap items-center gap-1.5">
            <span v-if="item.deadline" class="chip">
              <AppIcon name="clock" :size="10" />{{ formatMetaDate(item.deadline) }}
            </span>
            <span v-if="item.difficulty != null" class="chip font-mono">{{ formatDifficulty(item.difficulty) }}h</span>
          </div>
        </div>

        <!-- 行内操作 -->
        <div v-if="!item._isRef" class="flex items-center gap-0.5 shrink-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button
            class="p-1 rounded text-neutral-400 hover:bg-accent-50 hover:text-accent-800 dark:hover:bg-accent-500/10 dark:hover:text-accent-200 transition-colors"
            title="添加子任务" @click.stop="emitAddSubtask(item.id)">
            <AppIcon name="plus" :size="14" />
          </button>
          <button
            class="p-1 rounded text-neutral-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 transition-colors"
            title="删除任务" @click.stop="emitDeleteTodo(item.id)">
            <AppIcon name="trash" :size="14" />
          </button>
          <div class="relative">
            <button
              class="p-1 rounded text-neutral-400 hover:bg-accent-50 hover:text-accent-800 dark:hover:bg-accent-500/10 dark:hover:text-accent-200 transition-colors"
              title="更多操作" @click.stop="toggleMoreMenu(item.id, $event)">
              <AppIcon name="sliders" :size="14" />
            </button>
            <div v-if="showMoreMenuId === item.id"
              class="absolute right-0 top-full mt-1 w-40 panel shadow-lg z-30 py-1" ref="moreMenuRef">
              <button :disabled="isBreakingDown"
                class="w-full px-2.5 py-1.5 flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-accent-50 dark:hover:bg-accent-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                @click.stop="breakdownTask(item.id); closeMoreMenu()">
                <AppIcon name="sparkles" :size="13" />
                <span>AI 分解</span>
              </button>
              <button
                class="w-full px-2.5 py-1.5 flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-accent-50 dark:hover:bg-accent-500/10 transition-colors"
                @click.stop="emitAddSubtask(item.id); closeMoreMenu()">
                <AppIcon name="plus" :size="13" />
                <span>添加子任务</span>
              </button>
              <button
                class="w-full px-2.5 py-1.5 flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                @click.stop="emitDeleteTodo(item.id); closeMoreMenu()">
                <AppIcon name="trash" :size="13" />
                <span>删除任务</span>
              </button>
            </div>
          </div>
        </div>
      </li>
    </template>
  </ul>
</template>

<script setup>
import { computed, ref, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'

const props = defineProps({
  node: Object,
  selectedTaskId: Number,
  isBreakingDown: { type: Boolean, default: false }
})

const emit = defineEmits(['toggle-done', 'delete-todo', 'add-subtask', 'edit-subtask', 'task-selected', 'breakdown-task'])

const emitToggleDone = (item) => emit('toggle-done', item)
const emitDeleteTodo = (id) => emit('delete-todo', id)
const emitAddSubtask = (parentId) => {
  expandedMap.value[parentId] = true
  emit('add-subtask', parentId, startEdit)
}
const emitEditSubtask = (id, title) => emit('edit-subtask', id, title)
const emitTaskSelected = (id) => emit('task-selected', id)

// 分解任务
const breakdownTask = (id) => {
  emit('breakdown-task', id)
}

// 展平树结构为带层级的数组，并保留 children 信息和 parent_id
function flattenTree(node, level = 0, arr = [], parent_id = null) {
  if (!node) return arr
  arr.push({ ...node, _level: level, parent_id })
  if (node.children && node.children.length) {
    node.children.forEach((child) => flattenTree(child, level + 1, arr, node.id))
  }
  return arr
}
const flatList = computed(() => flattenTree(props.node))
const flatMap = computed(() => {
  const map = new Map()
  flatList.value.forEach(item => map.set(item.id, item))
  return map
})

const isItemVisible = (item) => {
  // 隐藏已完成项（优先使用本地状态映射）
  if (statusMap.value[item.id] === 'checked' || item.completed_at) return false
  if (!item.parent_id) return true

  // 祖先链任一节点折叠时隐藏，避免祖先折叠但后代仍显示
  let currentParentId = item.parent_id
  while (currentParentId) {
    if (expandedMap.value[currentParentId] === false) {
      return false
    }
    const parent = flatMap.value.get(currentParentId)
    currentParentId = parent?.parent_id || null
  }

  return true
}

// 折叠/展开状态
const expandedMap = ref({})
onMounted(() => {
  flatList.value.forEach(item => {
    if (item.children && item.children.length) {
      expandedMap.value[item.id] = false
    }
  })
})
const toggleExpand = (id) => {
  expandedMap.value[id] = !expandedMap.value[id]
}

const editingId = ref(null)
const editingText = ref('')
const suppressBlurOnceForId = ref(null)

// 两状态复选框状态映射：'unchecked' | 'checked'
const statusMap = ref({})

function initStatusMap() {
  flatList.value.forEach(item => {
    if (item._isRef) return
    if (item.completed_at) statusMap.value[item.id] = 'checked'
    else statusMap.value[item.id] = 'unchecked'
  })
}

initStatusMap()

watch(flatList, (newList) => {
  const idSet = new Set(newList.map(item => item.id))

  // 同步已有节点状态，避免远程更新后 UI 状态滞后
  newList.forEach(item => {
    if (item._isRef) return
    if (item.completed_at) statusMap.value[item.id] = 'checked'
    else statusMap.value[item.id] = 'unchecked'

    if (item.children && item.children.length && !(item.id in expandedMap.value)) {
      expandedMap.value[item.id] = false
    }
  })

  // 清理已不存在节点，避免状态对象无限增长
  Object.keys(statusMap.value).forEach((id) => {
    if (!idSet.has(Number(id))) {
      delete statusMap.value[id]
    }
  })
  Object.keys(expandedMap.value).forEach((id) => {
    if (!idSet.has(Number(id))) {
      delete expandedMap.value[id]
    }
  })
})

function cycleStatus(item) {
  const cur = statusMap.value[item.id] || (item.completed_at ? 'checked' : 'unchecked')
  const next = cur === 'checked' ? 'unchecked' : 'checked'
  statusMap.value[item.id] = next
  emitToggleDone(item)
}

// 更多菜单相关（记录当前打开面板的 DOM 元素，避免 v-for ref 冲突）
const showMoreMenuId = ref(null)
const currentMenuEl = ref(null)
const toggleMoreMenu = (id, ev) => {
  if (showMoreMenuId.value === id) {
    showMoreMenuId.value = null
    currentMenuEl.value = null
  } else {
    showMoreMenuId.value = id
    nextTick(() => {
      // 按钮的下一个兄弟节点为菜单容器（template 中结构保证）
      currentMenuEl.value = ev.currentTarget.nextElementSibling
    })
  }
}
const closeMoreMenu = () => {
  showMoreMenuId.value = null
  currentMenuEl.value = null
}
// 点击菜单外自动关闭（基于 currentMenuEl）
function handleClickOutside(event) {
  if (!showMoreMenuId.value) return
  const el = currentMenuEl.value
  if (!el) return
  if (!el.contains(event.target)) {
    closeMoreMenu()
  }
}
onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
  window.addEventListener('sync:id-replaced', handleIdReplaced)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside)
  window.removeEventListener('sync:id-replaced', handleIdReplaced)
})

const handleIdReplaced = (event) => {
  const { tempId, realId } = event.detail || {}
  if (tempId == null || realId == null) return

  // 新建任务同步后，保持编辑态随 ID 迁移
  if (editingId.value == tempId) {
    suppressBlurOnceForId.value = realId
    editingId.value = realId
    nextTick(() => {
      const input = document.getElementById('edit-input-' + realId)
      if (input) {
        input.focus()
        input.select()
      }
    })
  }
}

function startEdit(id, title) {
  editingId.value = id
  editingText.value = title

  nextTick(() => {
    const input = document.getElementById('edit-input-' + id)
    if (input) {
      input.focus()
      input.select()
    }
  })
}

function finishEdit(id, source = 'enter') {
  // 忽略过期输入框触发的 blur（例如 tempId -> realId 切换后）
  if (editingId.value != id) {
    return
  }

  // 仅忽略一次由 ID 替换引发的 blur，回车提交不应被吞掉
  if (source === 'blur' && suppressBlurOnceForId.value == id) {
    suppressBlurOnceForId.value = null
    return
  }

  const nextTitle = editingText.value.trim()
  const current = flatMap.value.get(id)
  if (!nextTitle || nextTitle === current?.title) {
    editingId.value = null
    editingText.value = ''
    return
  }

  emitEditSubtask(id, nextTitle)
  editingId.value = null
  editingText.value = ''
}

function selectTask(item) {
  emitTaskSelected(item._isRef ? item._refTargetId : item.id)
}

function formatDeadline(deadline) {
  if (!deadline) return ''
  const date = new Date(deadline)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)

  const diffDays = Math.floor((target - today) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '明天'
  if (diffDays === -1) return '昨天'
  if (diffDays > 0 && diffDays <= 7) return `${diffDays}天后`
  if (diffDays < 0 && diffDays >= -7) return `${Math.abs(diffDays)}天前`

  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function formatMetaDate(value) {
  if (!value) return ''
  return formatDeadline(value)
}

function formatDifficulty(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '-'
  return num % 1 === 0 ? String(num) : num.toFixed(2)
}
</script>