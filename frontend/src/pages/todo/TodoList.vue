<template>
  <div class="text-neutral-900 dark:text-neutral-100" @click.capture="handleRowClickCapture"
    @mousedown.capture="handleRowMouseDownCapture">
    <!-- 页面操作：统计放进主区域顶栏 -->
    <Teleport defer to="#main-topbar-actions">
      <p class="min-w-0 truncate whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">
        <span class="font-mono">{{ visibleCount }}</span> 项待办
        <template v-if="completedCount">
          <span class="px-1.5 text-neutral-300 dark:text-neutral-700">·</span>
          <span class="font-mono">{{ completedCount }}</span> 项已完成
        </template>
      </p>
    </Teleport>

    <!-- 快速添加 / 搜索：同一个输入框复用，左侧圆钮切换新建与搜索；min-h 保持两种模式同高 -->
    <div
      class="mt-4 ml-[22px] flex min-h-[42px] items-center gap-2.5 rounded-lg border border-hairline bg-surface py-1.5 pl-2 pr-1.5 shadow-[0_1px_2px_rgb(6_80_48/0.05)] transition-[border-color,box-shadow] focus-within:border-accent-500 focus-within:shadow-[0_3px_10px_rgb(6_80_48/0.09)] dark:border-hairline-dark dark:bg-surface-dark dark:shadow-none dark:focus-within:border-accent-500/60">
      <!-- 「模式切换」：虚线圈里的 + 表示新建，放大镜表示搜索 -->
      <button type="button"
        class="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-[1.5px] border-dashed transition-colors"
        :class="addMode === 'search'
          ? 'border-accent-500 text-accent-700 dark:border-accent-400 dark:text-accent-300'
          : 'border-neutral-300 text-neutral-400 hover:border-accent-500 hover:text-accent-700 dark:border-neutral-600 dark:text-neutral-500 dark:hover:border-accent-400 dark:hover:text-accent-200'"
        :title="addMode === 'search' ? '切回新建任务' : '搜索任务'"
        :aria-label="addMode === 'search' ? '切回新建任务' : '搜索任务'"
        :aria-pressed="addMode === 'search'" @click="toggleAddMode">
        <AppIcon :name="addMode === 'search' ? 'search' : 'plus'" :size="9" />
      </button>
      <input ref="addInputRef" v-model="addInputModel" @keyup.enter="handleAddEnter" @keyup.esc="handleAddEsc"
        :placeholder="addMode === 'search' ? '搜索任务，回车选中' : '添加任务，回车保存'"
        class="h-5 min-w-0 flex-1 bg-transparent text-sm leading-5 text-neutral-800 outline-none placeholder:text-neutral-400 dark:text-neutral-200 dark:placeholder:text-neutral-500" />
      <!-- 新建模式：截止时间与提交；搜索模式：有内容时给清空 -->
      <template v-if="addMode === 'add'">
        <!-- 截止时间：未设置时是日历按钮，设置后变成任务行同款标签，随任务一起创建 -->
        <DateTimePicker :model-value="newTaskDeadline ? toDateTimeLocalValue(newTaskDeadline) : ''" quick-dates trigger-clear
          @confirm="applyAddDeadline">
          <template #trigger="{ open, toggle }">
            <button v-if="!newTaskDeadline" type="button"
              class="grid h-7 w-7 place-items-center rounded-md text-neutral-400 transition-colors hover:bg-accent-50 hover:text-accent-800 dark:text-neutral-500 dark:hover:bg-accent-500/10 dark:hover:text-accent-200"
              title="设置截止时间" aria-label="设置截止时间" :aria-expanded="open" @click="toggle">
              <AppIcon name="calendar" :size="14" />
            </button>
            <button v-else type="button" class="chip gap-1 font-medium"
              :class="deadlineChipClass(newTaskDeadline)"
              :title="`修改截止时间（${formatDeadlineLabel(newTaskDeadline)}）`" :aria-expanded="open" @click="toggle">
              <AppIcon name="clock" :size="10" class="transition-opacity group-hover/picker:opacity-0 group-has-[:focus-visible]/picker:opacity-0" />{{ formatDeadlineLabel(newTaskDeadline) }}
            </button>
          </template>
        </DateTimePicker>
        <button type="button"
          class="grid h-7 w-7 shrink-0 place-items-center rounded-md text-neutral-400 transition-colors hover:bg-accent-50 hover:text-accent-800 disabled:opacity-30 dark:hover:bg-accent-500/10 dark:hover:text-accent-200"
          :disabled="!newTaskTitle.trim()" title="添加任务" aria-label="添加任务" @click="addTodo">
          <AppIcon name="chevronRight" :size="15" />
        </button>
      </template>
      <button v-else-if="searchQuery" type="button"
        class="grid h-7 w-7 shrink-0 place-items-center rounded-md text-neutral-400 transition-colors hover:bg-accent-50 hover:text-accent-800 dark:text-neutral-500 dark:hover:bg-accent-500/10 dark:hover:text-accent-200"
        title="清空搜索" aria-label="清空搜索" @click="clearSearch">
        <AppIcon name="close" :size="14" />
      </button>
    </div>

    <!-- 搜索结果数：只提示命中，不影响上方待办总数 -->
    <p v-if="isSearching" class="mt-1.5 ml-[22px] text-xs text-neutral-400 dark:text-neutral-500">
      找到 <span class="font-mono">{{ searchMatchCount }}</span> 项匹配任务
    </p>

    <!-- 错误提示 -->
    <section v-if="errorText" class="mt-3 flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400">
      <AppIcon name="alert" :size="14" />
      <span>{{ errorText }}</span>
    </section>

    <!-- 加载中 -->
    <section v-if="loading && !isFetched" class="mt-6 flex items-center gap-2 text-sm text-neutral-500">
      <AppIcon name="loader" :size="14" class="animate-spin" />
      加载中…
    </section>

    <!-- 空状态 -->
    <section v-if="!loading && allCount === 0 && !completedCount" class="mt-12 mb-8 text-center">
      <div
        class="mx-auto grid h-10 w-10 place-items-center rounded-full bg-accent-50 text-accent-700 dark:bg-accent-500/10 dark:text-accent-300">
        <AppIcon name="check" :size="18" />
      </div>
      <p class="mt-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">还没有任务</p>
      <p class="mt-1 text-xs text-neutral-400 dark:text-neutral-500">在上方写下第一件事，回车即可添加</p>
    </section>

    <!-- 任务列表 -->
    <template v-else-if="!loading">
      <!-- 待办标题：与已完成同款分组标题，收起后只留标题 -->
      <section v-if="allCount" class="mt-5 border-t border-hairline dark:border-hairline-dark">
        <div class="flex items-center gap-1 pt-2 pb-1">
          <button type="button"
            class="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            @click="showActivePanel = !showActivePanel">
            <AppIcon :name="showActivePanel ? 'chevronDown' : 'chevronRight'" :size="13" />
            <span>待办</span>
            <span
              class="rounded-full bg-neutral-100 px-1.5 font-mono text-[10px] leading-4 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">{{ visibleCount }}</span>
          </button>
          <!-- 「待办/已完成标题栏的多选操作」：有选中时换成该区的选中操作，否则显示排序方式 + 全部展开/折叠 -->
          <div class="ml-auto flex items-center gap-1.5">
            <template v-if="activeSelectionCount">
              <span class="text-[11px] text-neutral-500 dark:text-neutral-400"
                title="Ctrl/⌘ 继续选择，Shift 连选">已选
                <span class="font-mono font-medium text-accent-700 dark:text-accent-300">{{ activeSelectionCount }}</span> 项</span>
              <button type="button"
                class="grid h-7 w-7 place-items-center rounded-md text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                title="删除选中任务" aria-label="删除选中任务" @click="deleteSelectedTodos(activeSelectionKeys)">
                <AppIcon name="trash" :size="13" />
              </button>
              <button type="button"
                class="grid h-7 w-7 place-items-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                title="取消选择" aria-label="取消选择" @click="removeSelection(activeSelectionKeys)">
                <AppIcon name="close" :size="13" />
              </button>
            </template>
            <template v-else>
              <!-- 「筛选」：只看带截止时间的任务；旁边的箭头切换按截止时间的升/降序 -->
              <button type="button"
                class="grid h-7 w-7 shrink-0 place-items-center rounded-md border transition-colors"
                :class="dateOnly
                  ? 'border-accent-500 bg-accent-50 text-accent-700 dark:border-accent-400/60 dark:bg-accent-500/10 dark:text-accent-200'
                  : 'border-hairline text-neutral-600 hover:border-accent-500/60 dark:border-hairline-dark dark:text-neutral-300'"
                :aria-pressed="dateOnly" :title="dateOnly ? '显示全部任务' : '只看有日期的任务'"
                :aria-label="dateOnly ? '显示全部任务' : '只看有日期的任务'" @click="toggleDateOnly">
                <AppIcon name="calendar" :size="13" />
              </button>
              <button type="button"
                class="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-hairline text-neutral-600 transition-colors hover:border-accent-500/60 disabled:opacity-40 disabled:hover:border-hairline dark:border-hairline-dark dark:text-neutral-300 dark:disabled:hover:border-hairline-dark"
                :disabled="!dateOnly"
                :title="dateOrder === 'asc' ? '截止时间升序，点击改为降序' : '截止时间降序，点击改为升序'"
                :aria-label="dateOrder === 'asc' ? '切换为截止时间降序' : '切换为截止时间升序'"
                @click="toggleDateOrder">
                <AppIcon :name="dateOrder === 'asc' ? 'chevronUp' : 'chevronDown'" :size="13" />
              </button>
              <button v-if="foldableTasks.length && !isSearching" type="button"
                class="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-neutral-300 text-neutral-500 transition-colors hover:border-accent-500 hover:text-accent-700 dark:border-neutral-600 dark:text-neutral-400 dark:hover:border-accent-400 dark:hover:text-accent-200"
                :title="allCollapsed ? '展开全部子任务' : '折叠全部子任务'"
                :aria-label="allCollapsed ? '展开全部子任务' : '折叠全部子任务'"
                :aria-expanded="!allCollapsed" @click="toggleAllCollapsed">
                <AppIcon :name="allCollapsed ? 'plus' : 'minus'" :size="8" />
              </button>
            </template>
            <!-- 「任务添加按钮」：跳到顶部添加栏；搜索态顺便切回新建 -->
            <button type="button"
              class="grid h-6 w-6 shrink-0 place-items-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              title="添加任务" aria-label="添加任务" @click="focusAddInput">
              <AppIcon name="plus" :size="13" />
            </button>
          </div>
        </div>
      </section>

      <div v-if="showActivePanel" class="mt-1.5 space-y-1.5" data-task-section="active">
        <TodoListItem
          v-for="node in displayTree"
          :key="node.client_key || node.id"
          :node="node"
          :parent-id="todoStore.rootTaskId"
          :selected-task-id="props.selectedTaskId"
          :edit-request="pendingEdit"
          :selected-keys="selectionKeys"
          :ignore-collapse="isSearching"
          :highlight-query="isSearching ? searchQuery.trim() : ''"
          @toggle-done="toggleDone"
          @delete-todo="deleteTodo"
          @add-subtask="addSubtask"
          @edit-subtask="editSubtask"
          @task-selected="handleTaskSelected"
          @jump-to-graph="handleJumpToGraph"
          @set-deadline="setDeadline"
          @move-todo="moveTodo"
          @unlink-task="unlinkTask"
        />
        <p v-if="isSearching && searchMatchCount === 0" class="py-10 text-center text-xs text-neutral-400 dark:text-neutral-500">
          没有匹配的任务
        </p>
        <p v-else-if="dateOnly && visibleCount === 0" class="py-10 text-center text-xs text-neutral-400 dark:text-neutral-500">
          没有带日期的任务
        </p>
        <p v-else-if="visibleCount === 0" class="py-10 text-center text-xs text-neutral-400 dark:text-neutral-500">
          没有进行中的任务，已完成的收在下方
        </p>
      </div>
    </template>

    <!-- 已完成：无内容时不占位 -->
    <section v-if="completedCount" class="mt-6 border-t border-hairline dark:border-hairline-dark">
      <div class="flex items-center gap-1 pt-2 pb-1">
        <button type="button"
          class="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          @click="showCompletedPanel = !showCompletedPanel">
          <AppIcon :name="showCompletedPanel ? 'chevronDown' : 'chevronRight'" :size="13" />
          <span>已完成</span>
          <span
            class="rounded-full bg-neutral-100 px-1.5 font-mono text-[10px] leading-4 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">{{ completedCount }}</span>
        </button>
        <!-- 已完成的多选操作就放在本区标题栏：有选择时显示删除/取消，否则保留整区清除 -->
        <div v-if="completedSelectionCount" class="ml-auto flex items-center gap-1.5">
          <span class="text-[11px] text-neutral-500 dark:text-neutral-400"
            title="Ctrl/⌘ 继续选择，Shift 连选">已选
            <span class="font-mono font-medium text-accent-700 dark:text-accent-300">{{ completedSelectionCount }}</span> 项</span>
          <button type="button"
            class="grid h-7 w-7 place-items-center rounded-md text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
            title="删除选中任务" aria-label="删除选中任务" @click="deleteSelectedTodos(completedSelectionKeys)">
            <AppIcon name="trash" :size="13" />
          </button>
          <button type="button"
            class="grid h-7 w-7 place-items-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            title="取消选择" aria-label="取消选择" @click="removeSelection(completedSelectionKeys)">
            <AppIcon name="close" :size="13" />
          </button>
        </div>
        <button v-else type="button"
          class="ml-auto grid h-7 w-7 place-items-center rounded-md text-neutral-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
          title="清除已完成任务" @click="clearCompletedTodos">
          <AppIcon name="trash" :size="13" />
        </button>
      </div>
      <!-- 卡片左缘与待办行对齐：待办行用 22px 左内距给折叠开关留位，已完成行没有开关但保留同一缩进 -->
      <div v-if="showCompletedPanel" class="mt-1 pb-2 pl-[22px]" data-task-section="completed">
        <!-- [已完成按天分隔]：「日期 + 该天数量 + 分隔线」，最新完成的一天在最上面 -->
        <section v-for="(group, index) in completedGroups" :key="group.key" :class="index ? 'mt-3' : ''">
          <!-- 「日期分隔可点」：整行日期与分隔线都是折叠开关，只收起当天任务，标题与数量保留 -->
          <button type="button"
            class="mb-1.5 flex w-full cursor-pointer items-center gap-1.5 rounded-md pr-0.5 text-left transition-colors hover:text-neutral-700 dark:hover:text-neutral-200"
            :title="isCompletedDayCollapsed(group.key) ? `展开「${group.label}」的已完成任务` : `收起「${group.label}」的已完成任务`"
            :aria-expanded="!isCompletedDayCollapsed(group.key)" @click="toggleCompletedDay(group.key)">
            <AppIcon :name="isCompletedDayCollapsed(group.key) ? 'chevronRight' : 'chevronDown'" :size="11"
              class="shrink-0 text-neutral-400 dark:text-neutral-500" />
            <span class="text-[11px] font-medium text-neutral-400 dark:text-neutral-500">{{ group.label }}</span>
            <span class="font-mono text-[10px] text-neutral-300 dark:text-neutral-600">{{ group.count }}</span>
            <span aria-hidden="true" class="h-px flex-1 bg-neutral-200/80 dark:bg-neutral-800"></span>
          </button>
          <ul v-if="!isCompletedDayCollapsed(group.key)" class="space-y-1.5">
            <li v-for="t in group.todos" :key="t.id" data-task-item :data-task-id="t.id" @click="handleTaskSelected(t.id)" :class="[
              'group flex cursor-pointer items-center gap-2.5 rounded-lg text-sm transition-[border-color,box-shadow]',
              isCompletedRowSelected(t.id)
                ? 'border border-accent-500 bg-surface px-2.5 py-2 shadow-[0_3px_10px_rgb(6_80_48/0.09)] dark:border-accent-500/60 dark:bg-surface-dark dark:shadow-none'
                : 'border border-hairline bg-surface px-2.5 py-2 shadow-[0_1px_2px_rgb(6_80_48/0.05)] hover:border-accent-500/40 hover:shadow-[0_3px_10px_rgb(6_80_48/0.09)] dark:border-hairline-dark dark:bg-surface-dark dark:shadow-none dark:hover:border-accent-500/40'
            ]">
              <button type="button"
                class="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-[1.5px] border-accent-600 bg-accent-600 text-white transition-colors hover:bg-accent-700 hover:border-accent-700 dark:border-accent-400 dark:bg-accent-400 dark:text-accent-950"
                title="标记为未完成" aria-label="标记为未完成" @click.stop="toggleCompletedTodo(t)">
                <AppIcon name="check" :size="11" />
              </button>
              <MiddleEllipsis :text="t.title || '未命名任务'"
                class="min-w-0 flex-1 text-neutral-400 line-through dark:text-neutral-500" />
              <!-- 「完成时间」：日期由所在分组标题给出，行内只显示时分 -->
              <span class="shrink-0 font-mono text-[11px] text-neutral-400 dark:text-neutral-600">
                {{ formatCompletionTime(t.completed_at) }}
              </span>
              <!-- 「已完成行删除」：单条删除走软删除，提示里可撤销，与整区「清除已完成」互不影响 -->
              <button type="button"
                class="grid h-7 w-7 shrink-0 place-items-center rounded-md text-neutral-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                title="删除任务" aria-label="删除任务" @click.stop="deleteTodo(t.id)">
                <AppIcon name="trash" :size="13" />
              </button>
            </li>
          </ul>
        </section>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { useTodoStore } from '@/stores/todos'
import { useAuthStore } from '@/stores/auth'
import { toDateTimeLocalValue, deadlineChipClass, formatDeadlineLabel } from '@/utils/deadline'
import { sortTodoTree } from '@/utils/todoSort'
import { filterTasksByTitle, filterTaskTree } from '@/utils/taskGraph'
import { formatCompletionTime, groupCompletedByDay } from '@/utils/completedGroups'
import { pruneSelection, selectRange, toggleSelection } from '@/utils/taskSelection'
import { listTreeOf } from '@/utils/rootTask'
import { persistedRef } from '@/utils/uiState'
import { pruneTaskCollapseTree, isTaskCollapsed, setTaskCollapsed, setTasksCollapsed } from '@/utils/taskCollapse'
import { childTitlesOf, nextTaskTitle } from '@/utils/taskTitle'
import TodoListItem from '@/components/TodoListItem.vue'
import DateTimePicker from '@/components/DateTimePicker.vue'
import MiddleEllipsis from '@/components/MiddleEllipsis.vue'
import AppIcon from '@/components/AppIcon.vue'

const props = defineProps({
  selectedTaskId: {
    type: Number,
    default: null
  }
})

const todoStore = useTodoStore()
const authStore = useAuthStore()
const emit = defineEmits(['task-selected', 'jump-to-graph', 'notify'])

const newTaskTitle = ref('')
// 添加栏可以先选截止时间，创建任务时一并写入
const newTaskDeadline = ref('')
// 添加栏兼任搜索栏：模式只在当前会话里切换，不持久化
const addMode = ref('add')
const searchQuery = ref('')
const addInputRef = ref(null)
const isSearching = computed(() => addMode.value === 'search' && searchQuery.value.trim() !== '')
// 新建与搜索共用同一个输入框，切换模式后把焦点留在原处
const addInputModel = computed({
  get: () => (addMode.value === 'search' ? searchQuery.value : newTaskTitle.value),
  set: (value) => {
    if (addMode.value === 'search') searchQuery.value = value
    else newTaskTitle.value = value
  }
})
const toggleAddMode = () => {
  addMode.value = addMode.value === 'add' ? 'search' : 'add'
  if (addMode.value === 'add') searchQuery.value = ''
  nextTick(() => addInputRef.value?.focus())
}
// 新建任务后请求行内编辑：带着任务 ID 传给每一行，由包含该行的实例打开输入框
const pendingEdit = ref(null)
const loading = computed(() => todoStore.loading)
const isFetched = computed(() => todoStore.isFetched)
const errorText = computed(() => todoStore.error)

onMounted(async () => {
  if (authStore.isAuthenticated && !todoStore.isFetched) {
    await todoStore.fetchTodos()
  }
})

// 筛选只影响显示，偏好存在本地，不写数据库
const DATE_FILTER_STORAGE_KEY = 'todoheap:list-date-only'
const DATE_ORDER_STORAGE_KEY = 'todoheap:list-date-order'
const dateOnly = ref(localStorage.getItem(DATE_FILTER_STORAGE_KEY) === '1')
const dateOrder = ref(localStorage.getItem(DATE_ORDER_STORAGE_KEY) === 'desc' ? 'desc' : 'asc')
watch(dateOnly, (value) => localStorage.setItem(DATE_FILTER_STORAGE_KEY, value ? '1' : '0'))
watch(dateOrder, (value) => localStorage.setItem(DATE_ORDER_STORAGE_KEY, value))
const toggleDateOnly = () => { dateOnly.value = !dateOnly.value }
const toggleDateOrder = () => { dateOrder.value = dateOrder.value === 'asc' ? 'desc' : 'asc' }

// 根任务是挂载点，不渲染成列表行：列表展示它的子级
const baseTree = computed(() => listTreeOf(todoStore.treeNodes))
// 筛选只留下带截止时间的任务，保留祖先链作上下文，并按截止时间升/降序
const sortedTree = computed(() => {
  if (!dateOnly.value) return baseTree.value
  const sorted = sortTodoTree(baseTree.value, dateOrder.value === 'desc' ? 'deadline-desc' : 'deadline')
  return filterTaskTree(sorted, (node) => Boolean(node.deadline))
})

// 搜索：命中任务连同祖先链一起显示，父级只作上下文；不改变源顺序
const matchesSearch = (node) => (node.title || '').toLowerCase().includes(searchQuery.value.trim().toLowerCase())
const displayTree = computed(() => (isSearching.value ? filterTasksByTitle(sortedTree.value, searchQuery.value) : sortedTree.value))
const searchMatchCount = computed(() => {
  const count = (nodes) => nodes.reduce((acc, node) => acc
    + (node._isRef || !matchesSearch(node) ? 0 : 1)
    + count(node.children || []), 0)
  return isSearching.value ? count(displayTree.value) : 0
})
// 回车选中第一条命中：跳过回边行，落到真实任务
const firstMatchId = computed(() => {
  const walk = (nodes) => {
    for (const node of nodes) {
      if (!node._isRef && matchesSearch(node)) return node.id
      const hit = walk(node.children || [])
      if (hit != null) return hit
    }
    return null
  }
  return isSearching.value ? walk(displayTree.value) : null
})

// 任务删除或移入回收站后，清掉共享折叠状态里已经不存在的任务 ID
watch(() => todoStore.treeNodes, (nodes) => {
  pruneTaskCollapseTree(nodes)
}, { immediate: true })

const countNodes = (list, matches = () => true) => list.reduce((acc, n) => acc
  + (n._isRef || n.completed_at || !matches(n) ? 0 : 1)
  + countNodes(n.children || [], matches), 0)
// 全部待办用于空状态与标题栏存在性，可见数只统计通过筛选的任务
const allCount = computed(() => countNodes(baseTree.value))
const visibleCount = computed(() => countNodes(sortedTree.value, (node) => !dateOnly.value || Boolean(node.deadline)))

// 带子任务的可见行：快速添加栏的折叠开关按整张列表生效
const foldableTasks = computed(() => {
  const list = []
  const walk = (nodes, level) => nodes.forEach((node) => {
    if (node._isRef) return
    // 子任务全部完成时按叶子处理，不计入「展开/折叠全部」
    if (node.children?.some((child) => !child.completed_at)) list.push({ id: node.id, level })
    walk(node.children || [], level + 1)
  })
  walk(sortedTree.value, 0)
  return list
})

// 全部收起时按钮显示 +，点它展开全部；否则显示 −，点它折叠全部
const allCollapsed = computed(() => foldableTasks.value.length > 0
  && foldableTasks.value.every(({ id, level }) => isTaskCollapsed(id, level > 1)))

const toggleAllCollapsed = () => {
  setTasksCollapsed(foldableTasks.value.map(({ id }) => id), !allCollapsed.value)
}
const completedTodos = computed(() => todoStore.tasks.filter(todo => todo.completed_at))
const completedCount = computed(() => completedTodos.value.length)
// 已完成按完成日分组：分组与组内顺序见 utils/completedGroups.js
const completedGroups = computed(() => groupCompletedByDay(completedTodos.value))
// 日期分隔可点：按天收起当天已完成任务，收起集合只存在于当前会话
const collapsedCompletedDays = ref(new Set())
const isCompletedDayCollapsed = (key) => collapsedCompletedDays.value.has(key)
const toggleCompletedDay = (key) => {
  const next = new Set(collapsedCompletedDays.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  collapsedCompletedDays.value = next
}

// 多选：保存字符串任务 ID，锚点只用于 Shift 连选，普通点击即清空
const selection = ref(new Set())
const selectionAnchor = ref(null)
const selectionKeys = computed(() => [...selection.value])
// 操作条按分区显示：已完成键来自已完成列表，其余算待办
const completedKeySet = computed(() => new Set(completedTodos.value.map(todo => String(todo.id))))
const completedSelectionKeys = computed(() => selectionKeys.value.filter(key => completedKeySet.value.has(key)))
const activeSelectionKeys = computed(() => selectionKeys.value.filter(key => !completedKeySet.value.has(key)))
const completedSelectionCount = computed(() => completedSelectionKeys.value.length)
const activeSelectionCount = computed(() => activeSelectionKeys.value.length)
const isCompletedRowSelected = (id) => props.selectedTaskId === id || selection.value.has(String(id))
const clearSelection = () => {
  selection.value = new Set()
  selectionAnchor.value = null
}
// 只移除指定键：另一分区的选择保持不变
const removeSelection = (keys) => {
  if (!keys.length) return
  const next = new Set(selection.value)
  keys.forEach(key => next.delete(key))
  selection.value = next
  if (selectionAnchor.value && keys.includes(selectionAnchor.value)) selectionAnchor.value = null
}

// Ctrl/⌘ 切换、Shift 按当前可见行连选；普通点击清空选择后照常打开详情
const handleRowClickCapture = (event) => {
  const row = event.target.closest?.('[data-task-item]')
  if (!row || row.dataset.taskSelectable === 'false') return
  const key = row.dataset.taskId ? String(row.dataset.taskId) : ''
  if (!key) return
  // 行内的按钮、输入等交互优先，不让多选拦截
  if (event.target.closest('button, input, select, textarea, a, label')) return

  if (event.metaKey || event.ctrlKey) {
    event.preventDefault()
    event.stopPropagation()
    selection.value = toggleSelection(selection.value, key)
    selectionAnchor.value = key
    return
  }

  if (event.shiftKey && selectionAnchor.value) {
    const section = row.closest('[data-task-section]')
    const keys = section
      ? [...section.querySelectorAll('[data-task-item]')].map(el => String(el.dataset.taskId))
      : []
    // 锚点已收起或不在同一分区时，按普通点击处理
    if (keys.includes(selectionAnchor.value)) {
      event.preventDefault()
      event.stopPropagation()
      selection.value = selectRange(selection.value, keys, selectionAnchor.value, key)
      return
    }
  }

  // 普通点击清空选择，但记住这一行作为锚点，下一次 Shift 可直接从它连选
  selection.value = new Set()
  selectionAnchor.value = key
}

// 多选组合键下阻止浏览器从行内开始选文字；click 阶段再 preventDefault 已经太晚
const handleRowMouseDownCapture = (event) => {
  if (!(event.shiftKey || event.metaKey || event.ctrlKey)) return
  const row = event.target.closest?.('[data-task-item]')
  if (!row || row.dataset.taskSelectable === 'false') return
  if (event.target.closest('button, input, select, textarea, a, label')) return
  event.preventDefault()
}

// 任务被删除或移入回收站后，清掉选择里已经不存在或不可选的任务
watch(() => todoStore.tasks, (tasks) => {
  const available = new Set(tasks.map(todo => String(todo.id)))
  selection.value = pruneSelection(selection.value, available)
  if (selectionAnchor.value && !available.has(selectionAnchor.value)) selectionAnchor.value = null
})

// 批量删除：只处理传入分区的键；祖先被删后其后代已不在列表里，直接跳过；撤销按回收站 ID 整批恢复
const deleteSelectedTodos = async (keys) => {
  const targets = [...keys]
  removeSelection(targets)

  const trashedIds = []
  for (const key of targets) {
    const todo = todoStore.tasks.find(item => String(item.id) === key)
    if (!todo) continue
    const result = await todoStore.deleteTodo(todo.id)
    if (result.success && result.data?.id != null) trashedIds.push(result.data.id)
  }

  if (!targets.length) return
  emit('notify', {
    message: `已删除 ${targets.length} 项任务`,
    undo: trashedIds.length
      ? () => Promise.all(trashedIds.map(id => todoStore.restoreTodo(id)))
      : null
  })
}

// 已完成区域默认展开，与列表同属一页；展开状态本地保留
const showCompletedPanel = persistedRef('list-show-completed', true)
// 待办区域的收起状态同样本地保留
const showActivePanel = persistedRef('list-show-active', true)

// 分区收起后操作条不可见，清掉该区选择，避免看不见的选中被误删
watch(showActivePanel, (open) => {
  if (!open) removeSelection(activeSelectionKeys.value)
})
watch(showCompletedPanel, (open) => {
  if (!open) removeSelection(completedSelectionKeys.value)
})

const toggleCompletedTodo = async (todo) => {
  if (!todo?.id) return
  const previousCompletedAt = todo.completed_at ?? null
  const result = await todoStore.toggleDone(todo.id)
  if (!result.success) return

  emit('notify', {
    message: `已恢复「${todo.title || '任务'}」`,
    undo: () => todoStore.updateTodo(todo.id, { completed_at: previousCompletedAt })
  })
}

// 清除已完成：整棵已完成子树移入回收站，提示里可整体撤销
const clearCompletedTodos = async () => {
  if (!completedCount.value) return
  if (!window.confirm(`将 ${completedCount.value} 个已完成任务及其子任务移入回收站？`)) return

  const selectedWasCompleted = completedTodos.value.some(todo => todo.id === props.selectedTaskId)
  const result = await todoStore.deleteCompletedTodos()
  if (!result.success) return

  // 选中的任务随清除消失时收起详情面板
  if (selectedWasCompleted) {
    emit('task-selected', null)
  }

  const restoredIds = result.data?.ids || []
  emit('notify', {
    message: `已清除 ${result.count} 个已完成任务`,
    undo: restoredIds.length
      ? () => Promise.all(restoredIds.map(id => todoStore.restoreTodo(id)))
      : null
  })
}

const addTodo = async () => {
  const title = newTaskTitle.value.trim()
  if (!title) return

  const deadline = newTaskDeadline.value || null
  const result = await todoStore.addTodo(title, { deadline })

  newTaskTitle.value = ''
  newTaskDeadline.value = ''
  // 与新建子任务一致：选中新任务并打开行内编辑，光标直接落在标题上
  if (result.success && result.data?.id != null) {
    // 只看日期时，没有截止时间的新任务会被筛掉，先回到全部让新行可见
    if (dateOnly.value && !deadline) dateOnly.value = false
    emit('task-selected', result.data.id)
    pendingEdit.value = { id: result.data.id }
  }
}

// 回车：新建模式保存任务，搜索模式选中第一条命中
const handleAddEnter = () => {
  if (addMode.value === 'add') return addTodo()
  if (firstMatchId.value != null) emit('task-selected', firstMatchId.value)
}

// Esc：先清空搜索词，再按一次回到新建
const handleAddEsc = () => {
  if (addMode.value !== 'search') return
  if (searchQuery.value) clearSearch()
  else addMode.value = 'add'
}

// 清空搜索词后把焦点放回输入框，方便继续输入
const clearSearch = () => {
  searchQuery.value = ''
  nextTick(() => addInputRef.value?.focus())
}

// 「待办」标题栏的添加按钮：回到顶部添加栏；搜索态先切回新建再聚焦
const focusAddInput = () => {
  if (addMode.value !== 'add') {
    addMode.value = 'add'
    searchQuery.value = ''
  }
  nextTick(() => addInputRef.value?.focus())
}

// 选择器确认后写入本地时间，随任务一起创建；清空时回到未设置
const applyAddDeadline = (value) => {
  newTaskDeadline.value = value ? new Date(value).toISOString() : ''
}

// addTodo 默认把新任务头插到父级；这里按落点重排到指定兄弟之后，或同级末尾
const moveNewTaskTo = async (newId, parentId, afterId = null) => {
  if (parentId == null) return
  const parent = todoStore.findTodoById(parentId)
  if (!parent) return
  const siblings = (parent.child_ids || []).filter((id) => todoStore.findTodoById(id))
  const targetId = afterId != null
    ? afterId
    : [...siblings].reverse().find((id) => id !== newId)
  if (targetId == null) return
  await todoStore.moveTodo(newId, {
    targetId,
    position: 'after',
    sourceParentId: parentId,
    targetParentId: parentId
  })
}

const addSubtask = async (parentId, { append = false, select = false } = {}) => {
  // 父级折叠时新行会被藏住，先从菜单与键盘进来都先把父级展开
  setTaskCollapsed(parentId, false)
  // 连续新建子任务同样自动编号，默认标题与顶栏、任务图一致
  const title = nextTaskTitle(null, childTitlesOf(todoStore.todos, parentId))
  const result = await todoStore.addTodo(title, { parent_id: parentId })
  if (!result.success || !result.data) {
    if (result.error) emit('notify', { message: result.error })
    return
  }
  // 菜单入口沿用列表的头插；键盘 Tab 追加到同级末尾，与任务图一致
  if (append) await moveNewTaskTo(result.data.id, parentId)
  if (select) emit('task-selected', result.data.id)
  pendingEdit.value = { id: result.data.id }
}

// 在列表展示树里找任务的真实节点：键盘新建要用它所在的那条展示父链
const findListNode = (nodes, id) => {
  for (const node of nodes) {
    if (!node._isRef && node.id === id) return node
    const hit = findListNode(node.children || [], id)
    if (hit) return hit
  }
  return null
}

// 键盘 Enter：在选中任务之后建同级，插入位置与任务图 Enter 一致
const createSibling = async (node) => {
  const parentId = node.parent_id ?? todoStore.rootTaskId
  const reference = todoStore.findTodoById(node.id)
  const title = nextTaskTitle(reference?.title, childTitlesOf(todoStore.todos, parentId))
  const result = await todoStore.addTodo(title, { parent_id: parentId })
  if (!result.success || !result.data) {
    if (result.error) emit('notify', { message: result.error })
    return
  }
  await moveNewTaskTo(result.data.id, parentId, node.id)
  emit('task-selected', result.data.id)
  pendingEdit.value = { id: result.data.id }
}

// 任务表键盘新建：单选任务且焦点不在输入/按钮上时，Tab 建子级、Enter 建兄弟
const handleListKeydown = (event) => {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
  if (event.key !== 'Tab' && event.key !== 'Enter') return
  // 行内编辑、快速添加、详情面板与各种菜单里的键盘操作优先
  if (event.target?.closest?.('input, textarea, select, button, a, label, [contenteditable="true"]')) return
  if (!showActivePanel.value || props.selectedTaskId == null || selection.value.size > 0) return
  const node = findListNode(sortedTree.value, props.selectedTaskId)
  // 已完成区里的行也能选中，但它不在待办树里，不用它派生新任务
  if (!node || node.completed_at) return
  event.preventDefault()
  if (event.key === 'Tab') addSubtask(node.id, { append: true, select: true })
  else createSibling(node)
}

// 键盘新建只在任务表挂载期间监听：其它视图有各自的键盘规则
onMounted(() => document.addEventListener('keydown', handleListKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', handleListKeydown))

const editSubtask = async (id, newTitle) => {
  await todoStore.updateTodo(id, { title: newTitle })
}

const deleteTodo = async (id) => {
  const title = todoStore.findTodoById(id)?.title || '任务'
  const result = await todoStore.deleteTodo(id)
  if (!result.success) return

  // 回收站记录的是真实 ID，撤销时按它恢复
  const trashId = result.data?.id ?? id
  emit('notify', {
    message: `已删除「${title}」`,
    undo: () => todoStore.restoreTodo(trashId)
  })
}

const toggleDone = async (todo) => {
  const previousCompletedAt = todo.completed_at ?? null
  const result = await todoStore.toggleDone(todo.id)
  if (!result.success) return

  const title = todo.title || '任务'
  emit('notify', {
    message: previousCompletedAt ? `已恢复「${title}」` : `已完成「${title}」`,
    undo: () => todoStore.updateTodo(todo.id, { completed_at: previousCompletedAt })
  })
}

const setDeadline = async ({ id, deadline }) => {
  const previousDeadline = todoStore.findTodoById(id)?.deadline ?? null
  const result = await todoStore.updateTodo(id, { deadline })
  if (!result.success) return

  emit('notify', {
    message: deadline ? '已设置截止时间' : '已清除截止时间',
    undo: () => todoStore.updateTodo(id, { deadline: previousDeadline })
  })
}

const moveTodo = async ({ id, targetId, position, sourceParentId, targetParentId }) => {
  const result = await todoStore.moveTodo(id, { targetId, position, sourceParentId, targetParentId })
  if (!result.success && result.error) {
    emit('notify', { message: result.error })
  }
}

// 取消链接：只摘掉这条父链接；最后一个父级被摘掉时任务回到顶层
const unlinkTask = async ({ parentId, childId }) => {
  if (childId == null) return
  const result = await todoStore.unlinkTodo(parentId, childId)
  if (!result.success || result.data?.unchanged) return

  // 本行消失后把选中项切到该任务，另一个父级下出现它的那一行随之高亮
  emit('task-selected', childId)

  emit('notify', {
    message: '已取消链接',
    undo: () => {
      const actions = [todoStore.updateTodo(parentId, { child_ids: result.data.previousChildIds })]
      if (result.data.rootChildIds != null) {
        actions.push(todoStore.updateTodo(todoStore.rootTaskId, { child_ids: result.data.rootChildIds }))
      }
      return Promise.all(actions)
    }
  })
}

const handleTaskSelected = (taskId) => {
  emit('task-selected', taskId)
}

// 任务行菜单「节点视图」：列表只转发目标，切视图与定位由外层工作区负责
const handleJumpToGraph = (taskId) => {
  emit('jump-to-graph', taskId)
}
</script>
