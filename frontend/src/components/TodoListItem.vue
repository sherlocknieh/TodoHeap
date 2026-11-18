<template>
  <ul class="space-y-1.5">
    <template v-for="item in flatList">
      <li v-if="isItemVisible(item)" :key="item.id" data-task-item :draggable="canDrag(item)"
        class="group relative cursor-pointer" :style="{ paddingLeft: (4 + item._level * 22) + 'px' }"
        @click="handleRowClick(item)" @dragstart="onDragStart(item, $event)" @dragover.prevent="onDragOver(item, $event)"
        @dragleave="onDragLeave(item, $event)" @drop.prevent="onDrop(item, $event)" @dragend="onDragEnd">
        <!-- 缩进引导线：沿父级展开箭头中心向下贯穿，深层子任务在独立卡片间仍看得出归属 -->
        <span v-if="item._level > 0" aria-hidden="true"
          class="pointer-events-none absolute inset-y-0 w-px bg-hairline/70 dark:bg-hairline-dark/70"
          :style="{ left: (item._level * 22 - 1) + 'px' }"></span>
        <!-- 缩进留在外层，行内容单独成卡片，选中底色只覆盖任务自身范围；圆圈角与左边框宽度由状态类给出 -->
        <div class="flex items-center gap-2.5 rounded-lg transition-[border-color,box-shadow]"
          :class="rowStateClass(item)" :style="dropStyle(item.id)">
          <!-- 展开/折叠 -->
          <button v-if="item.children && item.children.length"
            class="p-0.5 rounded text-neutral-400 hover:text-accent-700 dark:hover:text-accent-300 transition-colors"
            @click.stop="toggleExpand(item)">
            <AppIcon :name="isItemExpanded(item) ? 'chevronDown' : 'chevronRight'" :size="13" />
          </button>
          <span v-else class="w-[18px] shrink-0"></span>

          <!-- 多选模式用方形选择框，日常完成状态用圆形勾选圈：形状即语义，避免两种状态混淆 -->
          <button v-if="selectionMode" type="button"
            class="shrink-0 grid place-items-center h-[18px] w-[18px] rounded-[5px] border transition-colors"
            :class="isSelected(item)
              ? 'bg-accent-600 border-accent-600 text-white dark:bg-accent-400 dark:border-accent-400 dark:text-accent-950'
              : 'border-neutral-300 text-transparent hover:border-accent-500 hover:bg-accent-50 dark:border-neutral-600 dark:hover:border-accent-400 dark:hover:bg-accent-500/10'"
            :aria-pressed="isSelected(item)" :aria-label="isSelected(item) ? '取消选择' : '选择任务'"
            @click.stop="emitToggleSelect(item)">
            <AppIcon name="check" :size="10" />
          </button>
          <button v-else-if="!item._isRef" type="button"
            class="shrink-0 grid place-items-center h-[18px] w-[18px] rounded-full border-[1.5px] transition-colors"
            :class="statusMap[item.id] === 'checked'
              ? 'bg-accent-600 border-accent-600 text-white dark:bg-accent-400 dark:border-accent-400 dark:text-accent-950'
              : 'border-neutral-300 text-transparent hover:border-accent-500 hover:bg-accent-50 dark:border-neutral-600 dark:hover:border-accent-400 dark:hover:bg-accent-500/10'"
            :aria-pressed="statusMap[item.id] === 'checked'"
            :aria-label="statusMap[item.id] === 'checked' ? '标记为未完成' : '标记为完成'"
            @click.stop="cycleStatus(item)">
            <AppIcon name="check" :size="11" />
          </button>
          <span v-else class="w-[18px] shrink-0"></span>

          <!-- 标题与元信息：标签跟标题同一行，长标题换行时不挤掉标签 -->
          <div class="flex min-w-0 flex-1 items-center gap-2">
            <div class="min-w-0 flex-1">
              <span v-if="editingId !== item.id" :class="[
                'flex min-w-0 items-center gap-1 overflow-hidden text-sm leading-5',
                isRowSelected(item)
                  ? 'font-semibold text-accent-900 dark:text-accent-100'
                  : ['text-neutral-800 dark:text-neutral-200', item._level === 0 ? 'font-medium' : ''],
                { 'line-through text-neutral-400 dark:text-neutral-600': item.completed_at && !item._isRef }
              ]" @dblclick.stop="!selectionMode && !item._isRef && startEdit(item.id, item.title)">
                <AppIcon v-if="item._isRef" name="link" :size="11"
                  class="shrink-0 text-neutral-400 dark:text-neutral-500" />
                <MiddleEllipsis :text="item.title || '未命名任务'" class="min-w-0 flex-1"
                  :class="{ 'text-neutral-400 dark:text-neutral-500': item._isRef && !isRowSelected(item) }" />
              </span>
              <input v-else :id="'edit-input-' + item.id" v-model="editingText"
                class="w-full bg-transparent text-sm leading-5 text-neutral-900 dark:text-neutral-100 outline-none border-b border-accent-600 dark:border-accent-400"
                @blur="finishEdit(item.id, 'blur')" @keyup.enter="finishEdit(item.id, 'enter')"
                @keyup.esc="editingId = null" />
            </div>

            <div v-if="editingId !== item.id && (item.deadline || item.duration != null)"
              class="flex shrink-0 items-center gap-1.5">
              <button v-if="item.deadline" type="button"
                class="chip gap-1 font-medium transition-colors"
                :class="deadlineChipClass(item.deadline)"
                data-deadline-trigger :title="`修改截止时间（${formatDeadline(item.deadline)}）`"
                @click.stop="toggleDeadlineMenu(item)">
                <AppIcon name="clock" :size="10" />{{ formatMetaDate(item.deadline) }}
              </button>
              <span v-if="item.duration != null" title="预计耗时"
                class="rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] leading-4 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                {{ formatDuration(item.duration) }}h
              </span>
            </div>
          </div>

          <!-- 行内操作 -->
          <div v-if="item._isRef && !selectionMode" class="flex shrink-0 items-center gap-0.5">
            <button type="button"
              class="grid h-7 w-7 place-items-center rounded-md text-neutral-400 opacity-0 transition-all hover:bg-accent-50 hover:text-accent-800 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:bg-accent-500/10 dark:hover:text-accent-200"
              title="取消链接" aria-label="取消链接" @click.stop="emitUnlink(item)">
              <AppIcon name="unlink" :size="13" />
            </button>
          </div>
          <div v-if="!item._isRef && !selectionMode"
            class="flex shrink-0 items-center gap-0.5">
            <div class="relative">
              <button v-if="!item.deadline" type="button"
                class="grid h-7 w-7 place-items-center rounded-md text-neutral-400 transition-colors hover:bg-accent-50 hover:text-accent-800 dark:text-neutral-500 dark:hover:bg-accent-500/10 dark:hover:text-accent-200"
                data-deadline-trigger title="设置截止时间" aria-label="设置截止时间"
                @click.stop="toggleDeadlineMenu(item)">
                <AppIcon name="calendar" :size="14" />
              </button>
              <div v-if="showDeadlineMenuId === item.id" data-deadline-menu
                class="absolute right-0 top-full mt-1 w-48 panel shadow-lg z-30 py-1">
                <button v-for="preset in DEADLINE_PRESETS" :key="preset.value" type="button"
                  class="w-full px-2.5 py-1.5 flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-accent-50 dark:hover:bg-accent-500/10 transition-colors"
                  @click.stop="applyDeadlinePreset(item.id, preset.value)">
                  <AppIcon :name="preset.icon" :size="13" />
                  <span>{{ preset.label }}</span>
                </button>
                <label class="block px-2.5 py-1.5 text-xs text-neutral-500">
                  自定义时间
                  <input v-model="customDeadline" type="datetime-local" class="field mt-1 text-xs"
                    @change="applyDeadlinePreset(item.id, 'custom')" />
                </label>
                <button v-if="item.deadline" type="button"
                  class="w-full px-2.5 py-1.5 flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                  @click.stop="applyDeadlinePreset(item.id, 'clear')">
                  <AppIcon name="close" :size="13" />
                  <span>清除截止时间</span>
                </button>
              </div>
            </div>
            <div class="relative">
              <button
                class="grid h-7 w-7 place-items-center rounded-md text-neutral-400 transition-colors hover:bg-accent-50 hover:text-accent-800 dark:hover:bg-accent-500/10 dark:hover:text-accent-200"
                title="更多操作" data-more-trigger @click.stop="toggleMoreMenu(item.id, $event)">
                <AppIcon name="more" :size="14" />
              </button>
              <div v-if="showMoreMenuId === item.id"
                class="absolute right-0 top-full mt-1 w-40 panel shadow-lg z-30 py-1" ref="moreMenuRef">
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
        </div>
      </li>
    </template>
  </ul>
</template>

<script setup>
import { computed, ref, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import MiddleEllipsis from '@/components/MiddleEllipsis.vue'
import { DEADLINE_PRESETS, resolveDeadlinePreset, toDateTimeLocalValue } from '@/utils/deadline'
import { draggingTodoId as draggingId, draggingParentTodoId, dropIndicator, resetDragState } from '@/utils/todoDrag'
import { isTaskCollapsed, setTaskCollapsed, toggleTaskCollapsed } from '@/utils/taskCollapse'

const props = defineProps({
  node: Object,
  selectedTaskId: Number,
  // 顶层行在上层视图里的父级：列表里是根任务，缺省时按无父级处理
  parentId: { type: [Number, String], default: null },
  // 多选模式：用勾选框替换完成状态与行内操作
  selectionMode: { type: Boolean, default: false },
  selectedIds: { type: Array, default: () => [] }
})

const emit = defineEmits([
  'toggle-done',
  'delete-todo',
  'add-subtask',
  'edit-subtask',
  'task-selected',
  'toggle-select',
  'set-deadline',
  'move-todo',
  'unlink-task'
])

const emitToggleDone = (item) => emit('toggle-done', item)
const emitDeleteTodo = (id) => emit('delete-todo', id)
// 回边行没有真实父节点，用渲染它的节点作为父级解除引用
const emitUnlink = (item) => emit('unlink-task', { parentId: item.parent_id, childId: item._refTargetId })
const emitAddSubtask = (parentId) => {
  setTaskCollapsed(parentId, false)
  emit('add-subtask', parentId, startEdit)
}
const emitEditSubtask = (id, title) => emit('edit-subtask', id, title)
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
const flatList = computed(() => flattenTree(props.node, 0, [], props.parentId))
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
    const parent = flatMap.value.get(currentParentId)
    if (!parent) break
    if (isTaskCollapsed(currentParentId, parent._level > 1)) return false
    currentParentId = parent.parent_id || null
  }

  return true
}

// 折叠状态与图、回收站共享；未记录的任务默认展开前两层，更深的任务默认收起
const isItemExpanded = (item) => !isTaskCollapsed(item.id, (item._level || 0) > 1)

const toggleExpand = (item) => {
  toggleTaskCollapsed(item.id, (item._level || 0) > 1)
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
  })

  // 清理已不存在节点，避免状态对象无限增长
  Object.keys(statusMap.value).forEach((id) => {
    if (!idSet.has(Number(id))) {
      delete statusMap.value[id]
    }
  })
})

function cycleStatus(item) {
  const cur = statusMap.value[item.id] || (item.completed_at ? 'checked' : 'unchecked')
  const next = cur === 'checked' ? 'unchecked' : 'checked'
  statusMap.value[item.id] = next
  emitToggleDone(item)
}

// 多选与拖拽共用真实任务 ID，引用行指向被引用的任务
const selectableIdOf = (item) => (item._isRef ? item._refTargetId : item.id)
const isSelected = (item) => props.selectedIds.includes(selectableIdOf(item))
const emitToggleSelect = (item) => emit('toggle-select', selectableIdOf(item))

// 行状态底色：选中用中性底加左侧强调条，拖入内部才用浅强调色提示；底色与边框全部由状态决定，避免基础类覆盖
const isRowSelected = (item) => props.selectedTaskId === selectableIdOf(item)

const rowStateClass = (item) => {
  const indicator = dropIndicator.value
  if (indicator && indicator.id === item.id && indicator.position === 'inside') {
    return 'border py-1.5 pl-2 pr-1.5 border-accent-500 bg-accent-50 shadow-[inset_3px_0_0_0_var(--color-accent-500),0_2px_8px_rgb(6_80_48/0.12)] dark:border-accent-500/60 dark:bg-accent-500/10 dark:shadow-[inset_3px_0_0_0_var(--color-accent-500)]'
  }
  // 选中沿用左侧视图列表：绿底 + 只留左缘实线 + 绿字。没有上下边框，绿条才能顺圆角收成尖端；
  // 用 7px 内边距补回普通行 1px 上下边框与 1px 左右边框占掉的空间，选中时不跳动；
  // 阴影与未选中保持同一组值，行只过渡悬停的边框与阴影，其余属性随选中一起在一帧内切换，
  // 因此不存在半透明的中间帧
  if (isRowSelected(item)) {
    return 'border-l-2 border-l-accent-600 bg-accent-100/80 py-[7px] pl-[7px] pr-[7px] shadow-[0_1px_2px_rgb(6_80_48/0.05)] hover:shadow-[0_3px_10px_rgb(6_80_48/0.09)] dark:border-l-accent-400 dark:bg-accent-500/20 dark:shadow-none'
  }
  // 回边行只是指向已存在任务的引用，虚线边框让它在实体任务之间显得更轻
  return [
    'border py-1.5 pl-2 pr-1.5 border-hairline bg-surface shadow-[0_1px_2px_rgb(6_80_48/0.05)] hover:border-accent-200 hover:shadow-[0_3px_10px_rgb(6_80_48/0.09)]',
    'dark:border-hairline-dark dark:bg-surface-dark dark:shadow-none dark:hover:border-accent-500/40',
    item._isRef ? 'border-dashed' : ''
  ].join(' ')
}

// 拖拽刚结束时浏览器仍会补发一次 click，短暂忽略避免误选中
let suppressClickUntil = 0
const handleRowClick = (item) => {
  if (Date.now() < suppressClickUntil) return
  if (props.selectionMode) {
    emitToggleSelect(item)
    return
  }
  selectTask(item)
}

// 截止时间快捷预设由共享工具换算，自定义与实际选择统一转 ISO
const applyDeadlinePreset = (id, preset) => {
  if (preset === 'custom') {
    if (!customDeadline.value) return
    emit('set-deadline', { id, deadline: new Date(customDeadline.value).toISOString() })
  } else {
    emit('set-deadline', { id, deadline: resolveDeadlinePreset(preset) })
  }
  closeDeadlineMenu()
}

// 拖拽：上四分位插到前面，下四分位插到后面，中间成为子任务
// 编辑中的行禁用拖拽，否则在输入框内拖选文字会被 dragstart 劫持
const canDrag = (item) => !props.selectionMode && !item._isRef && editingId.value !== item.id

const dropStyle = (id) => {
  const indicator = dropIndicator.value
  if (!indicator || indicator.id !== id) return {}
  if (indicator.position === 'before') return { boxShadow: 'inset 0 2px 0 0 var(--color-accent-500)' }
  if (indicator.position === 'after') return { boxShadow: 'inset 0 -2px 0 0 var(--color-accent-500)' }
  return {}
}

const onDragStart = (item, event) => {
  if (!canDrag(item)) return
  draggingId.value = item.id
  draggingParentTodoId.value = item.parent_id ?? null
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', String(item.id))
  closeMoreMenu()
  closeDeadlineMenu()
}

const onDragOver = (item, event) => {
  if (draggingId.value == null || item._isRef) return
  if (item.id === draggingId.value) {
    dropIndicator.value = null
    return
  }
  const rect = event.currentTarget.getBoundingClientRect()
  const offset = (event.clientY - rect.top) / rect.height
  const position = offset < 0.25 ? 'before' : offset > 0.75 ? 'after' : 'inside'
  dropIndicator.value = { id: item.id, position }
}

const onDragLeave = (item, event) => {
  if (dropIndicator.value?.id !== item.id) return
  // 在行内部移动到子元素时也会触发 dragleave，此时不应清掉落点提示
  if (event?.relatedTarget && event.currentTarget.contains(event.relatedTarget)) return
  dropIndicator.value = null
}

const onDrop = (item, event) => {
  const sourceId = draggingId.value
  const sourceParentId = draggingParentTodoId.value
  resetDragState()
  // 引用行只是回边，不作为落点
  if (sourceId == null || item._isRef) return

  // 落点按投放时的实际位置判断，避免中途 dragleave 清空提示后无法落位
  const rect = event.currentTarget.getBoundingClientRect()
  const offset = (event.clientY - rect.top) / rect.height
  const position = offset < 0.25 ? 'before' : offset > 0.75 ? 'after' : 'inside'
  emit('move-todo', {
    id: sourceId,
    targetId: item.id,
    position,
    sourceParentId,
    targetParentId: item.parent_id ?? null
  })
}

const onDragEnd = () => {
  resetDragState()
  suppressClickUntil = Date.now() + 150
}

// 更多菜单相关（记录当前打开面板的 DOM 元素，避免 v-for ref 冲突）
const showMoreMenuId = ref(null)
const currentMenuEl = ref(null)
const toggleMoreMenu = (id, ev) => {
  if (showMoreMenuId.value === id) {
    showMoreMenuId.value = null
    currentMenuEl.value = null
  } else {
    closeDeadlineMenu()
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

// 截止时间菜单与更多菜单互斥，同一时间只展开一个
const showDeadlineMenuId = ref(null)
const customDeadline = ref('')

const closeDeadlineMenu = () => {
  showDeadlineMenuId.value = null
  customDeadline.value = ''
}

const toggleDeadlineMenu = (item) => {
  if (showDeadlineMenuId.value === item.id) {
    closeDeadlineMenu()
    return
  }
  closeMoreMenu()
  customDeadline.value = item.deadline ? toDateTimeLocalValue(item.deadline) : ''
  showDeadlineMenuId.value = item.id
}
// 点击菜单外自动关闭（基于 currentMenuEl）
function handleClickOutside(event) {
  if (showMoreMenuId.value) {
    const el = currentMenuEl.value
    const onTrigger = event.target.closest?.('[data-more-trigger]')
    if (el && !el.contains(event.target) && !onTrigger) {
      closeMoreMenu()
    }
  }
  if (showDeadlineMenuId.value) {
    const target = event.target
    const insideMenu = target.closest?.('[data-deadline-menu]')
    const onTrigger = target.closest?.('[data-deadline-trigger]')
    if (!insideMenu && !onTrigger) {
      closeDeadlineMenu()
    }
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

// 截止标签按到期状态着色：逾期红、今天绿、以后中性，扫清单时最急的先跳出来
function deadlineChipClass(value) {
  if (!value) return ''
  const due = new Date(value)
  if (Number.isNaN(due.getTime())) return ''

  const now = new Date()
  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)

  if (due < now) {
    return 'border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:border-rose-500/50'
  }
  if (due <= endOfToday) {
    return 'border-accent-200 bg-accent-50 text-accent-800 hover:border-accent-300 dark:border-accent-500/30 dark:bg-accent-500/10 dark:text-accent-200 dark:hover:border-accent-500/50'
  }
  return 'border-hairline text-neutral-500 hover:border-accent-300 hover:text-neutral-700 dark:border-hairline-dark dark:text-neutral-400 dark:hover:border-accent-500/40 dark:hover:text-neutral-200'
}

function formatDuration(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '-'
  return num % 1 === 0 ? String(num) : num.toFixed(2)
}
</script>