<template>
  <ul class="list-none p-0 m-0">
    <template v-for="item in flatList">
      <li v-if="!item.parent_id || expandedMap[item.parent_id]" :key="item.id" :class="[
        'flex items-center gap-2.5 p-2.5 px-3 bg-white border-b border-slate-100 transition-colors duration-150 cursor-pointer',
        {
          'bg-blue-50 border-l-3 border-l-blue-600': selectedTaskId === item.id,
          'opacity-60': item.status === 'done'
        }
      ]" :style="{ paddingLeft: (12 + item._level * 20) + 'px' }" @click="selectTask(item.id)">
        <!-- 展开/折叠按钮预留空间，只有父任务显示按钮，其他显示透明占位 -->
        <div class="flex items-center mr-1 w-8 justify-center">
          <button v-if="item.children && item.children.length" class="inline-flex items-center justify-center w-7 h-7 border-none bg-transparent rounded cursor-pointer transition-colors duration-150 text-slate-500 hover:bg-slate-200" @click.stop="toggleExpand(item.id)">
            <svg v-if="expandedMap[item.id]" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>
            <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <span v-else class="inline-block w-6 h-6"></span>
        </div>
        <!-- 自定义三状态复选框 -->
        <div class="shrink-0">
          <button type="button" class="inline-flex items-center justify-center w-6 h-6 rounded border" :class="{
            'bg-blue-600 border-blue-600 text-white': statusMap[item.id] === 'checked',
            'bg-white border-slate-300 text-slate-700': statusMap[item.id] === 'unchecked',
            'bg-slate-100 border-slate-300 text-slate-700': statusMap[item.id] === 'indeterminate'
          }" @click.stop="cycleStatus(item)" :aria-pressed="statusMap[item.id] === 'checked'">
            <template v-if="statusMap[item.id] === 'checked'">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </template>
            <template v-else-if="statusMap[item.id] === 'indeterminate'">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 12h12" stroke-linecap="round"/></svg>
            </template>
          </button>
        </div>

        <!-- 标题 -->
        <div class="flex-1 min-w-0" @dblclick.stop="startEdit(item.id, item.title)">
          <span v-if="editingId !== item.id" :class="[
            'block text-sm text-slate-800 font-normal leading-relaxed break-words',
            { 'line-through text-slate-500': item.status === 'done' }
          ]">
            {{ item.title || '未命名任务' }}
          </span>
          <input v-else :id="'edit-input-' + item.id" v-model="editingText" class="w-full px-2 py-1 text-sm border border-blue-600 rounded outline-none bg-white"
            @blur="finishEdit(item.id)" @keyup.enter="finishEdit(item.id)" @keyup.esc="editingId = null" />
          <!-- 同步状态指示器 -->
          <span v-if="item._isSyncing" class="inline-flex items-center ml-1.5 text-slate-500" title="正在同步...">
            <svg class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" stroke-linecap="round"/>
            </svg>
          </span>
        </div>

        <!-- 操作按钮组 -->
        <div class="flex items-center gap-1 shrink-0 opacity-100 pointer-events-auto transition-opacity duration-150">
          <div class="text-xs text-slate-500 px-2 py-0.5 bg-slate-100 rounded">
            <template v-if="item.deadline">
              <span>{{ formatDeadline(item.deadline) }}</span>
            </template>
            <template v-else>
              <button class="inline-flex items-center justify-center w-7 h-7 border-none bg-transparent rounded cursor-pointer transition-colors duration-150 text-slate-400" title="设置截止" type="button" disabled>
                <svg class="inline-block align-middle" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
              </button>
            </template>
          </div>
          <button class="inline-flex items-center justify-center w-7 h-7 border-none bg-transparent rounded cursor-pointer transition-colors duration-150 text-slate-500 hover:bg-slate-200" @click.stop="emitAddSubtask(item.id, startEdit)"
            title="添加子任务">
            <span class="text-lg leading-none font-light">+</span>
          </button>
          <button class="inline-flex items-center justify-center w-7 h-7 border-none bg-transparent rounded cursor-pointer transition-colors duration-150 text-slate-500 hover:bg-red-100 hover:text-red-600" @click.stop="emitDeleteTodo(item.id)" title="删除任务">
            <span class="text-lg leading-none font-light">×</span>
          </button>
          <div class="relative">
            <button class="inline-flex items-center justify-center w-7 h-7 border-none bg-transparent rounded cursor-pointer transition-colors duration-150 text-slate-500 hover:bg-slate-200" @click.stop="toggleMoreMenu(item.id, $event)" title="更多操作">
              <span class="text-lg leading-none font-light">···</span>
            </button>
            <div v-if="showMoreMenuId === item.id" class="absolute right-0 mt-2 w-36 bg-white border border-slate-200 rounded shadow-lg" ref="moreMenuRef">
              <ul class="py-1 text-sm text-slate-700">
                <li><button class="w-full text-left px-4 py-2 hover:bg-slate-100" @click.stop="emitAddSubtask(item.id, startEdit); closeMoreMenu()">添加子任务</button></li>
                <li><button class="w-full text-left px-4 py-2 hover:bg-slate-100" @click.stop="emitDeleteTodo(item.id); closeMoreMenu()">删除任务</button></li>
                <li><button class="w-full text-left px-4 py-2 hover:bg-slate-100" @click.stop="copyTitle(item)">复制任务标题</button></li>
                <li><button class="w-full text-left px-4 py-2 hover:bg-slate-100" @click.stop="markToday(item)">标记为今日</button></li>
                <!-- 可继续添加更多功能项 -->
              </ul>
            </div>
          </div>
        </div>
      </li>
    </template>
  </ul>
</template>

<script setup>
import { computed, ref, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'

const props = defineProps({
  node: Object,
  selectedTaskId: Number
})

const emit = defineEmits(['toggle-done', 'delete-todo', 'add-subtask', 'edit-subtask', 'task-selected', 'set-status'])
const emitToggleDone = (node) => emit('toggle-done', node)
// 将组件内三态映射到后端状态: unchecked -> 'todo', indeterminate -> 'doing', checked -> 'done'
const mapToBackendStatus = (state) => {
  if (state === 'checked') return 'done'
  if (state === 'indeterminate') return 'doing'
  return 'todo'
}
const emitSetStatus = (id, state) => emit('set-status', id, mapToBackendStatus(state))
const emitDeleteTodo = (id) => emit('delete-todo', id)
const emitAddSubtask = (parentId, cb) => emit('add-subtask', parentId, cb)
const emitEditSubtask = (id) => emit('edit-subtask', id, editingText.value)
const emitTaskSelected = (id) => emit('task-selected', id)


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

// 三状态复选框状态映射：'unchecked' | 'indeterminate' | 'checked'
const statusMap = ref({})

function initStatusMap() {
  flatList.value.forEach(item => {
    if (item.status === 'done') statusMap.value[item.id] = 'checked'
    else if (item.status === 'doing') statusMap.value[item.id] = 'indeterminate'
    else statusMap.value[item.id] = 'unchecked'
  })
}

initStatusMap()

watch(flatList, (newList) => {
  newList.forEach(item => {
    if (!(item.id in statusMap.value)) {
      if (item.status === 'done') statusMap.value[item.id] = 'checked'
      else if (item.status === 'doing') statusMap.value[item.id] = 'indeterminate'
      else statusMap.value[item.id] = 'unchecked'
    }
  })
})

function cycleStatus(item) {
  const cur = statusMap.value[item.id] || (item.status === 'done' ? 'checked' : 'unchecked')
  let next
  if (cur === 'unchecked') next = 'indeterminate'
  else if (cur === 'indeterminate') next = 'checked'
  else next = 'unchecked'
  statusMap.value[item.id] = next
  emitSetStatus(item.id, next)
}

// 截止时间编辑相关
const editingDeadlineId = ref(null)
const editingDeadlineValue = ref('')
const saveDeadline = (item) => {
  if (editingDeadlineValue.value && editingDeadlineValue.value !== item.deadline) {
    emit('edit-subtask', item.id, { deadline: editingDeadlineValue.value })
  }
  editingDeadlineId.value = null
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
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside)
})

// 设置优先级示例
const setPriority = (item) => {
  // 可弹窗或直接 emit('edit-subtask', item.id, { priority: 新值 })
  closeMoreMenu()
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

function finishEdit(id) {
  console.log('finishEdit', id, editingText.value)
  emitEditSubtask(id, editingText.value)
  editingId.value = null
  editingText.value = ''
}

function selectTask(id) {
  emitTaskSelected(id)
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
</script>
