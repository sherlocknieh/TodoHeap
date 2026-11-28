<template>
  <ul class="space-y-1.5">
    <template v-for="item in visibleRows" :key="item.client_key || item.id">
      <li data-task-item :data-task-id="item.id" :data-task-selectable="item._isRef ? 'false' : null"
        :draggable="canDrag(item)"
        class="group relative cursor-pointer" :style="{ paddingLeft: rowPaddingLeft(item._level) + 'px' }"
        @click="handleRowClick(item)" @dragstart="onDragStart(item, $event)" @dragover.prevent="onDragOver(item, $event)"
        @dragleave="onDragLeave(item, $event)" @drop.prevent="onDrop(item, $event)" @dragend="onDragEnd">
        <!-- 树状连线：祖先层还有后续兄弟时，竖线沿本行贯穿到下一行 -->
        <template v-for="(continues, index) in item._guides" :key="'guide-' + index">
          <span v-if="continues" aria-hidden="true"
            class="pointer-events-none absolute -top-1.5 -bottom-1.5 w-0.5 bg-neutral-300 dark:bg-neutral-600"
            :style="{ left: guideX(index + 1) + 'px' }"></span>
        </template>
        <!-- 自身层：竖线自上一行接到行中心，末位兄弟收成 └ 角，其余继续向下 -->
        <span v-if="item._level > 0" aria-hidden="true"
          class="pointer-events-none absolute w-0.5 bg-neutral-300 dark:bg-neutral-600"
          :style="itemGuideStyle(item)"></span>
        <!-- 分叉横线：从竖线指向卡片左缘 -->
        <span v-if="item._level > 0" aria-hidden="true"
          class="pointer-events-none absolute h-0.5 bg-neutral-300 dark:bg-neutral-600"
          :style="elbowStyle(item)"></span>
        <!-- 缩进留在外层，行内容单独成卡片；边框、底色与内边距都由状态类统一给出，选中时不改变盒子尺寸 -->
        <div class="flex items-center gap-2.5 rounded-lg transition-[border-color,box-shadow]"
          :class="rowStateClass(item)" :style="dropStyle(item.id)">
          <!-- 「展开/折叠开关」：收进卡片，占据勾选圈的位置；叶子任务仍显示圆形勾选圈 -->
          <button v-if="hasActiveChildren(item)" type="button"
            class="shrink-0 grid place-items-center h-[18px] w-[18px] rounded-full border-[1.5px] border-neutral-300 text-neutral-500 transition-colors hover:border-accent-500 hover:text-accent-700 dark:border-neutral-600 dark:text-neutral-400 dark:hover:border-accent-400 dark:hover:text-accent-200"
            :title="isItemExpanded(item) ? '折叠子任务' : '展开子任务'"
            :aria-label="isItemExpanded(item) ? '折叠子任务' : '展开子任务'"
            :aria-expanded="isItemExpanded(item)" @click.stop="toggleExpand(item)">
            <AppIcon :name="isItemExpanded(item) ? 'minus' : 'plus'" :size="9" />
          </button>
          <!-- 完成状态用圆形勾选圈；回边行与实体行共用真实任务的完成状态 -->
          <button v-else type="button"
            class="shrink-0 grid place-items-center h-[18px] w-[18px] rounded-full border-[1.5px] transition-colors"
            :class="isChecked(item)
              ? 'bg-accent-600 border-accent-600 text-white dark:bg-accent-400 dark:border-accent-400 dark:text-accent-950'
              : 'border-neutral-300 text-transparent hover:border-accent-500 hover:bg-accent-50 dark:border-neutral-600 dark:hover:border-accent-400 dark:hover:bg-accent-500/10'"
            :aria-pressed="isChecked(item)"
            :aria-label="isChecked(item) ? '标记为未完成' : '标记为完成'"
            @click.stop="cycleStatus(item)">
            <AppIcon name="check" :size="11" />
          </button>

          <!-- 标题与元信息：标签跟标题同一行，长标题换行时不挤掉标签 -->
          <div class="flex min-w-0 flex-1 items-center gap-2">
            <div class="min-w-0 flex-1">
              <span v-if="editingId !== item.id" :class="[
                'flex min-w-0 items-center gap-1 overflow-hidden text-sm leading-5',
                'text-neutral-800 dark:text-neutral-200',
                item._level === 0 ? 'font-medium' : '',
                { 'line-through text-neutral-400 dark:text-neutral-600': item.completed_at }
              ]" @dblclick.stop="startEdit(item.id, item.title)">
                <MiddleEllipsis :text="item.title || '未命名任务'" class="min-w-0 flex-1" :highlight="highlightQuery" />
              </span>
              <input v-else :id="'edit-input-' + item.id" v-model="editingText"
                class="w-full bg-transparent text-sm leading-5 text-neutral-900 dark:text-neutral-100 outline-none"
                @blur="finishEdit(item.id, 'blur')" @keyup.enter="finishEdit(item.id, 'enter')"
                @keyup.esc="editingId = null" />
            </div>

            <div v-if="editingId !== item.id && (item.deadline || item.duration != null)"
              class="flex shrink-0 items-center gap-1.5">
              <DateTimePicker v-if="item.deadline" :model-value="toDateTimeLocalValue(item.deadline)"
                quick-dates trigger-clear @confirm="applyDeadline(selectableIdOf(item), $event)">
                <template #trigger="{ open, toggle }">
                  <button type="button" class="chip gap-1 font-medium"
                    :class="deadlineChipClass(item.deadline)" :aria-expanded="open"
                    :title="`修改截止时间（${formatDeadlineLabel(item.deadline)}）`" @click.stop="toggle">
                    <AppIcon name="clock" :size="10" class="transition-opacity group-hover/picker:opacity-0 group-has-[:focus-visible]/picker:opacity-0" />{{ formatDeadlineLabel(item.deadline) }}
                  </button>
                </template>
              </DateTimePicker>
              <span v-if="item.duration != null" title="预计耗时"
                class="rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] leading-4 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                {{ formatDuration(item.duration) }}h
              </span>
            </div>
          </div>

          <!-- 行内操作：回边行与实体行一致，写操作都落到真实任务 ID 上 -->
          <div class="flex shrink-0 items-center gap-0.5">
            <DateTimePicker v-if="!item.deadline" :model-value="''" quick-dates
              @confirm="applyDeadline(selectableIdOf(item), $event)">
              <template #trigger="{ open, toggle }">
                <button type="button"
                  class="grid h-7 w-7 place-items-center rounded-md text-neutral-400 transition-colors hover:bg-accent-50 hover:text-accent-800 dark:text-neutral-500 dark:hover:bg-accent-500/10 dark:hover:text-accent-200"
                  title="设置截止时间" aria-label="设置截止时间" :aria-expanded="open" @click.stop="toggle">
                  <AppIcon name="calendar" :size="14" />
                </button>
              </template>
            </DateTimePicker>
            <div class="relative">
              <button
                class="grid h-7 w-7 place-items-center rounded-md text-neutral-400 transition-colors hover:bg-accent-50 hover:text-accent-800 dark:hover:bg-accent-500/10 dark:hover:text-accent-200"
                title="更多操作" data-more-trigger @click.stop="toggleMoreMenu(item.id, $event)">
                <AppIcon name="moreVertical" :size="14" />
              </button>
              <div v-if="showMoreMenuId === item.id"
                class="absolute right-0 top-full mt-1 w-40 panel shadow-lg z-30 py-1 overflow-hidden" ref="moreMenuRef">
                <!-- 「添加子任务」：菜单首项，最常用的新建入口 -->
                <button
                  class="w-full px-2.5 py-1.5 flex items-center gap-2 text-sm text-neutral-700 transition-colors hover:bg-accent-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:text-neutral-300 dark:hover:bg-accent-500/10 dark:disabled:hover:bg-transparent"
                  :disabled="disableAddSubtask"
                  :title="disableAddSubtask ? '筛选结果中不能添加子任务' : null"
                  @click.stop="emitAddSubtask(item); closeMoreMenu()">
                  <AppIcon name="plus" :size="13" />
                  <span>添加子任务</span>
                </button>
                <!-- 「标记完成」：勾选任务，行随完成状态移出待办区 -->
                <button
                  class="w-full px-2.5 py-1.5 flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-accent-50 dark:hover:bg-accent-500/10 transition-colors"
                  @click.stop="cycleStatus(item); closeMoreMenu()">
                  <AppIcon name="check" :size="13" />
                  <span>标记完成</span>
                </button>
                <!-- 「完成任务树」：整棵子树一起完成，已完成的保留原完成时间 -->
                <button
                  class="w-full px-2.5 py-1.5 flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-accent-50 dark:hover:bg-accent-500/10 transition-colors"
                  @click.stop="emitCompleteTree(item); closeMoreMenu()">
                  <AppIcon name="checks" :size="13" />
                  <span>完成任务树</span>
                </button>
                <!-- 「在任务图中查看」：切到任务图，节点居中并 100% 缩放 -->
                <button
                  class="w-full px-2.5 py-1.5 flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-accent-50 dark:hover:bg-accent-500/10 transition-colors"
                  @click.stop="emitJumpToGraph(selectableIdOf(item)); closeMoreMenu()">
                  <AppIcon name="graph" :size="13" />
                  <span>在任务图中查看</span>
                </button>
                <!-- 「脱离父任务」：断开本行所在的父链接；最后一个父级被断开时任务回到顶层 -->
                <button v-if="item._level > 0"
                  class="w-full px-2.5 py-1.5 flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-accent-50 dark:hover:bg-accent-500/10 transition-colors"
                  @click.stop="emitUnlink(item); closeMoreMenu()">
                  <AppIcon name="unlink" :size="13" />
                  <span>脱离父任务</span>
                </button>
                <button
                  class="w-full px-2.5 py-1.5 flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                  @click.stop="emitDeleteTodo(selectableIdOf(item)); closeMoreMenu()">
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
import DateTimePicker from '@/components/DateTimePicker.vue'
import MiddleEllipsis from '@/components/MiddleEllipsis.vue'
import { toDateTimeLocalValue, deadlineChipClass, formatDeadlineLabel } from '@/utils/deadline'
import { draggingTodoId as draggingId, draggingParentTodoId, dropIndicator, resetDragState } from '@/utils/todoDrag'
import { isTaskCollapsed, toggleTaskCollapsed } from '@/utils/taskCollapse'

const props = defineProps({
  node: Object,
  selectedTaskId: Number,
  // 多选高亮：上层列表维护的字符串 ID 集合，回边行不参与选择
  selectedKeys: { type: Array, default: () => [] },
  // 顶层行在上层视图里的父级：列表里是根任务，缺省时按无父级处理
  parentId: { type: [Number, String], default: null },
  // 搜索时忽略折叠，命中行的祖先链始终展开
  ignoreCollapse: { type: Boolean, default: false },
  // 搜索高亮：把命中的搜索词标在标题里
  highlightQuery: { type: String, default: '' },
  // 筛选结果平铺显示：不允许从这里建子任务或拖拽重排
  disableAddSubtask: { type: Boolean, default: false },
  disableDrag: { type: Boolean, default: false },
  // 新建任务后由上层请求打开行内编辑：带着任务 ID，只有包含该行的实例响应
  editRequest: { type: Object, default: null }
})

const emit = defineEmits([
  'toggle-done',
  'complete-tree',
  'delete-todo',
  'add-subtask',
  'edit-subtask',
  'task-selected',
  'jump-to-graph',
  'set-deadline',
  'move-todo',
  'unlink-task'
])

const emitToggleDone = (item) => emit('toggle-done', { ...item, id: selectableIdOf(item) })
// 完成整棵子树的入口: 与勾选圈一样落到真实任务 ID, 父级由 store 沿 child_ids 展开
const emitCompleteTree = (item) => emit('complete-tree', selectableIdOf(item))
const emitDeleteTodo = (id) => emit('delete-todo', id)
// 选中与写操作共用真实任务 ID：回边行指向被引用的任务
const selectableIdOf = (item) => (item._isRef ? item._refTargetId : item.id)
// 回边行用渲染它的父级解除引用，实体子行用真实父级
const emitUnlink = (item) => emit('unlink-task', { parentId: item.parent_id, childId: selectableIdOf(item) })
const emitAddSubtask = (item) => {
  // 筛选结果是平铺列表，没有层级上下文，不从这里建子任务
  if (props.disableAddSubtask) return
  // 正在给这一行改名时先提交草稿，再新增子任务，避免切换编辑目标时丢掉刚输入的名字
  if (editingId.value === item.id) finishEdit(item.id, 'enter')
  emit('add-subtask', selectableIdOf(item))
}
const emitEditSubtask = (id, title) => emit('edit-subtask', id, title)
// 行内菜单「在任务图中查看」交给外层切视图，行组件不直接操作路由
const emitJumpToGraph = (id) => emit('jump-to-graph', id)
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

// 上层请求行内编辑（新建任务后）：本实例包含那一行才打开输入框，其余实例忽略
watch(() => props.editRequest, (request) => {
  if (!request?.id) return
  const item = flatMap.value.get(request.id)
  if (!item) return
  startEdit(item.id, item.title)
})

// 有未完成子任务才显示折叠开关：子任务全部完成时按叶子任务处理，开关消失
const isChecked = (item) => statusMap.value[selectableIdOf(item)] === 'checked'
const isTaskDone = (item) => isChecked(item) || Boolean(item.completed_at)
const hasActiveChildren = (item) => (item.children || []).some((child) => !isTaskDone(child))

const isItemVisible = (item) => {
  // 隐藏已完成项（优先使用本地状态映射）
  if (isChecked(item) || item.completed_at) return false
  if (!item.parent_id) return true
  // 搜索时忽略折叠状态，命中行的祖先链始终展开
  if (props.ignoreCollapse) return true

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

// 缩进、树状连线与折叠开关共用同一套几何。
// 竖线落在「上一级勾选圈圆心」：卡片在竖线右侧 ELBOW_WIDTH(10px)，卡片左缘到勾选圈圆心 18px
// （边框 1 + 左内距 8 + 半径 9），所以每层缩进 = 10 + 18 = 28。横线因此总能从竖线顶到卡片左缘。
const ELBOW_WIDTH = 10
const CHECKBOX_CENTER_INSET = 18
const LEVEL_INDENT = ELBOW_WIDTH + CHECKBOX_CENTER_INSET
const GUIDE_OFFSET = 12
const guideLeft = (level) => level * LEVEL_INDENT + GUIDE_OFFSET
const rowPaddingLeft = (level) => guideLeft(level) + ELBOW_WIDTH

// 连线粗细 2px：竖线左移半个线宽，线心仍落在上一级圆钮圆心上；横线起点取线心，末端正好顶到卡片左缘
const GUIDE_LINE_WIDTH = 2
const guideX = (level) => guideLeft(level) - GUIDE_LINE_WIDTH / 2

// 渲染行：过滤隐藏项，并为每行算出连线（祖先层竖线 + 自身分叉、末位兄弟收角）
const visibleRows = computed(() => {
  const rows = flatList.value.filter(isItemVisible)
  const byId = flatMap.value

  // 同父同层的最后一个可见兄弟即末位，竖线到此收成 └ 角
  const lastVisible = new Map()
  rows.forEach((item) => {
    lastVisible.set(`${item.parent_id ?? 'root'}@${item._level}`, item.id)
  })
  const hasNextSibling = (item) =>
    lastVisible.get(`${item.parent_id ?? 'root'}@${item._level}`) !== item.id

  const ancestorAtLevel = (item, level) => {
    let current = item
    while (current && current._level > level) {
      current = current.parent_id == null ? null : byId.get(current.parent_id)
    }
    return current && current._level === level ? current : null
  }

  return rows.map((item) => {
    const guides = []
    for (let level = 1; level < item._level; level += 1) {
      const ancestor = ancestorAtLevel(item, level)
      // 祖先本身被隐藏时不再画它那一层的竖线
      guides.push(Boolean(ancestor) && isItemVisible(ancestor) && hasNextSibling(ancestor))
    }
    return { ...item, _guides: guides, _lastSibling: !hasNextSibling(item) }
  })
})

const itemGuideStyle = (item) => {
  const style = { left: guideX(item._level) + 'px', top: '-6px' }
  // 末位兄弟只连到行中心，后面的兄弟则贯穿整行并补上列表间距
  if (item._lastSibling) style.height = 'calc(50% + 6px)'
  else style.bottom = '-6px'
  return style
}

// 横线长度等于竖线到卡片左缘的距离，末端正好顶到卡片边框；纵向抬半个线宽，与行中心对齐
const elbowStyle = (item) => ({
  left: guideLeft(item._level) + 'px',
  top: `calc(50% - ${GUIDE_LINE_WIDTH / 2}px)`,
  width: ELBOW_WIDTH + 'px'
})

// 折叠状态与图、回收站共享；未记录的任务默认展开前两层，更深的任务默认收起
const isItemExpanded = (item) => !isTaskCollapsed(item.id, (item._level || 0) > 1)

const toggleExpand = (item) => {
  toggleTaskCollapsed(item.id, (item._level || 0) > 1)
}

const editingId = ref(null)
const editingText = ref('')

// 两状态复选框状态映射：'unchecked' | 'checked'
const statusMap = ref({})

function initStatusMap() {
  flatList.value.forEach(item => {
    statusMap.value[selectableIdOf(item)] = item.completed_at ? 'checked' : 'unchecked'
  })
}

initStatusMap()

watch(flatList, (newList) => {
  const idSet = new Set(newList.map(item => selectableIdOf(item)))

  // 同步已有节点状态，避免远程更新后 UI 状态滞后
  newList.forEach(item => {
    statusMap.value[selectableIdOf(item)] = item.completed_at ? 'checked' : 'unchecked'
  })

  // 清理已不存在节点，避免状态对象无限增长
  Object.keys(statusMap.value).forEach((id) => {
    if (!idSet.has(Number(id))) {
      delete statusMap.value[id]
    }
  })
})

function cycleStatus(item) {
  const id = selectableIdOf(item)
  const cur = statusMap.value[id] || (item.completed_at ? 'checked' : 'unchecked')
  const next = cur === 'checked' ? 'unchecked' : 'checked'
  statusMap.value[id] = next
  emitToggleDone(item)
}

// 行状态：拖入内部用浅强调色提示；选中只强调边框，边框与底色全部由状态决定，避免基础类覆盖
const isRowSelected = (item) => props.selectedTaskId === selectableIdOf(item)
// 多选高亮：待办行与已完成行共用同一套选中样式，回边行不可选
const selectedKeySet = computed(() => new Set(props.selectedKeys))
const isMultiSelected = (item) => !item._isRef && selectedKeySet.value.has(String(item.id))

const rowStateClass = (item) => {
  const indicator = dropIndicator.value
  if (indicator && indicator.id === item.id && indicator.position === 'inside') {
    return 'border py-1.5 pl-2 pr-1.5 border-accent-500 bg-accent-50 shadow-[inset_3px_0_0_0_var(--color-accent-500),0_2px_8px_rgb(6_80_48/0.12)] dark:border-accent-500/60 dark:bg-accent-500/10 dark:shadow-[inset_3px_0_0_0_var(--color-accent-500)]'
  }
  // 选中与任务添加栏的聚焦态一致：只换边框色并加投影，盒子尺寸、底色和文字都不动
  if (isRowSelected(item) || isMultiSelected(item)) {
    return 'border py-1.5 pl-2 pr-1.5 border-accent-500 bg-surface shadow-[0_3px_10px_rgb(6_80_48/0.09)] dark:border-accent-500/60 dark:bg-surface-dark dark:shadow-none'
  }
  // 所有行同一套卡片外观，选中只换边框与投影
  return [
    'border py-1.5 pl-2 pr-1.5 border-hairline bg-surface shadow-[0_1px_2px_rgb(6_80_48/0.05)] hover:border-accent-500/40 hover:shadow-[0_3px_10px_rgb(6_80_48/0.09)]',
    'dark:border-hairline-dark dark:bg-surface-dark dark:shadow-none dark:hover:border-accent-500/40'
  ].join(' ')
}

// 拖拽刚结束时浏览器仍会补发一次 click，短暂忽略避免误选中
let suppressClickUntil = 0
const handleRowClick = (item) => {
  if (Date.now() < suppressClickUntil) return
  selectTask(item)
}

// 选择器确认后把本地时间转 ISO 落库；清空时写 null 表示移除截止时间
const applyDeadline = (id, value) => {
  emit('set-deadline', { id, deadline: value ? new Date(value).toISOString() : null })
}

// 拖拽：上四分位插到前面，下四分位插到后面，中间成为子任务
// 编辑中的行禁用拖拽，否则在输入框内拖选文字会被 dragstart 劫持
const canDrag = (item) => !props.disableDrag && !item._isRef && editingId.value !== item.id

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
  if (showMoreMenuId.value) {
    const el = currentMenuEl.value
    const onTrigger = event.target.closest?.('[data-more-trigger]')
    if (el && !el.contains(event.target) && !onTrigger) {
      closeMoreMenu()
    }
  }
}
// 换号重新聚焦时浏览器可能补发一次 blur；在下一次用户交互前不把它当作用户失焦，
// 否则正在输入的新任务会被同步打断。用户一旦按下指针或按键，保护立即解除
let ignoreBlurAfterReplace = false
const releaseBlurGuard = () => { ignoreBlurAfterReplace = false }

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
  window.addEventListener('pointerdown', releaseBlurGuard, true)
  window.addEventListener('keydown', releaseBlurGuard, true)
  window.addEventListener('sync:id-replaced', handleIdReplaced)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside)
  window.removeEventListener('pointerdown', releaseBlurGuard, true)
  window.removeEventListener('keydown', releaseBlurGuard, true)
  window.removeEventListener('sync:id-replaced', handleIdReplaced)
})

const handleIdReplaced = (event) => {
  const { tempId, realId } = event.detail || {}
  if (tempId == null || realId == null) return

  // 新建任务同步后，保持编辑态随 ID 迁移
  if (editingId.value == tempId) {
    // 记下换号前的位置, 换号后原位恢复; 不能全选, 否则下一次按键会把已输入内容覆盖掉
    const current = document.getElementById('edit-input-' + tempId)
    const selection = current ? [current.selectionStart, current.selectionEnd] : null
    ignoreBlurAfterReplace = true
    editingId.value = realId
    nextTick(() => {
      const input = document.getElementById('edit-input-' + realId)
      if (!input) return
      input.focus()
      const end = input.value.length
      const [start, stop] = selection ?? [end, end]
      input.setSelectionRange(Math.min(start, end), Math.min(stop, end))
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

  // 换号后、用户还没重新操作时补发的 blur 不算失焦提交
  if (source === 'blur' && ignoreBlurAfterReplace) return

  const nextTitle = editingText.value.trim()
  const current = flatMap.value.get(id)
  if (!nextTitle || nextTitle === current?.title) {
    editingId.value = null
    editingText.value = ''
    return
  }

  emitEditSubtask(selectableIdOf(current ?? { id }), nextTitle)
  editingId.value = null
  editingText.value = ''
}

function selectTask(item) {
  emitTaskSelected(selectableIdOf(item))
}

function formatDuration(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '-'
  return num % 1 === 0 ? String(num) : num.toFixed(2)
}
</script>