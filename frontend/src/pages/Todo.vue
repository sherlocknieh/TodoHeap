<script setup>

import { ref, onMounted, computed, watch, onUnmounted, provide, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useTodoStore } from '@/stores/todos'
import { useSyncQueueStore } from '@/stores/syncQueue'
import { storeToRefs } from 'pinia'
import LeftSidebar from '@/components/LeftSidebar.vue'
import AppIcon from '@/components/AppIcon.vue'
import TodoDetailEditor from '@/components/TodoDetailEditor.vue'
import AgentContextPanel from '@/components/AgentContextPanel.vue'
import ScheduleDetailPanel from '@/components/ScheduleDetailPanel.vue'
import { TODO_DETAIL_PANEL_CONTEXT } from '@/utils/detailPanelContext'
import Settings from '@/pages/todo/Settings.vue'
import { settingsPanelOpen } from '@/utils/settingsPanel'
import { persistedRef, useScrollMemory, SIDEBAR_FLOAT_BREAKPOINT } from '@/utils/uiState'
import logoSrc from '@/assets/logo.svg'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const todoStore = useTodoStore()
const syncQueueStore = useSyncQueueStore()

// 获取同步队列状态
const { hasUnsyncedChanges } = storeToRefs(syncQueueStore)

const userMenuRef = ref(null)

// 根据路由名称同步当前视图
const activeView = computed({
	get: () => {
		const routeName = route.name
		if (routeName === 'GraphView') return 'graph'
		if (routeName === 'HeapView') return 'heap'
		if (routeName === 'TrashView') return 'trash'
		if (routeName === 'AIView') return 'ai'
		if (routeName === 'ScheduleView') return 'schedule'
		return 'list' // 默认是 ListView
	},
	set: (view) => {
		const viewNames = {
			'list': 'ListView',
			'graph': 'GraphView',
			'heap': 'HeapView',
			'trash': 'TrashView',
			'ai': 'AIView',
			'schedule': 'ScheduleView'
		}
		router.push({ name: viewNames[view] })
	}
})

const showUserMenu = ref(false)
// 选中任务与详情面板沿用上次离开时的状态
const selectedTaskId = persistedRef('selected-task', null, {
	validate: (value) => value === null || Number.isFinite(value)
})
const showDetailPanel = persistedRef('detail-open', false)
// 日程视图的右栏编辑选中的日程，与其他视图的任务选中互不干扰
const selectedEventId = persistedRef('selected-event', null, {
	validate: (value) => value === null || Number.isFinite(value)
})
// 侧栏显示状态：首次进入窄屏默认收起，之后沿用上次的开合
const showLeftSidebar = persistedRef('sidebar-open', window.innerWidth >= SIDEBAR_FLOAT_BREAKPOINT)
// 活动栏显示状态：收起后由顶栏按钮开回
const showActivityRail = persistedRef('rail-open', true)
const windowWidth = ref(window.innerWidth)

// 中栏滚动位置记忆：每个视图各存一份，刷新或切换回来后回到原处
const mainScrollRef = ref(null)
const { save: saveMainScroll, restore: restoreMainScroll } = useScrollMemory(mainScrollRef, () => activeView.value)

const showViewLoading = computed(() => {
	return (activeView.value === 'graph' || activeView.value === 'heap') && todoStore.loading
})

// 顶栏标题：主区域统一呈现当前视图名称
const activeViewTitle = computed(() => {
	if (activeView.value === 'graph') return '任务图'
	if (activeView.value === 'heap') return '堆视图'
	if (activeView.value === 'trash') return '回收站'
	if (activeView.value === 'ai') return 'AI'
	if (activeView.value === 'schedule') return '日程'
	return '任务表'
})

// 底栏统计：全局完成进度，侧栏收起时也能一眼看到
const taskStats = computed(() => {
	const total = todoStore.todos.length
	const completed = todoStore.todos.filter(todo => todo.completed_at).length
	return { total, completed, pending: total - completed }
})

// 统计面板默认折叠，展开状态沿用上次的选择
const statsExpanded = persistedRef('stats-expanded', false)

const completionRate = computed(() =>
	taskStats.value.total ? Math.round((taskStats.value.completed / taskStats.value.total) * 100) : 0
)

// 活动栏主入口：清单、日程与 AI 分别对应视图与侧栏内容
const navEntries = [
	{ id: 'list', label: '清单', icon: 'list' },
	{ id: 'schedule', label: '日程', icon: 'calendar' },
	{ id: 'ai', label: 'AI' }
]

// 清单入口涵盖列表、树、堆、回收站
const activeSection = computed(() => {
	if (activeView.value === 'ai') return 'ai'
	if (activeView.value === 'schedule') return 'schedule'
	return 'list'
})

const isNavEntryActive = (id) => id === activeSection.value

// 收起左侧导航前的侧栏开合，开回时恢复原样
let sidebarBeforeRailCollapse = false

// 收起左侧导航：活动栏与侧栏一起隐藏，避免留下无从关闭的侧栏
const collapseNavigation = () => {
	sidebarBeforeRailCollapse = showLeftSidebar.value
	showActivityRail.value = false
	showLeftSidebar.value = false
}

// 开回左侧导航：顶栏按钮触发，恢复收起前的侧栏状态
const expandNavigation = () => {
	showActivityRail.value = true
	showLeftSidebar.value = sidebarBeforeRailCollapse
}

// 点击当前入口切换侧栏，点击其他入口切换视图；窄屏下侧栏保持收起，避免遮住内容
const openNavEntry = (entry) => {
	if (activeSection.value === entry.id) {
		showLeftSidebar.value = !showLeftSidebar.value
		return
	}
	switchView(entry.id)
	showLeftSidebar.value = window.innerWidth >= SIDEBAR_FLOAT_BREAKPOINT
}

const syncStatusLabel = computed(() => hasUnsyncedChanges.value ? '有待同步更改' : '已同步')

const realtimeStatusLabel = computed(() => {
	const status = String(todoStore.realtimeStatus || 'UNKNOWN').toUpperCase()
	if (status === 'SUBSCRIBED') return '已连接'
	if (status === 'CONNECTING') return '连接中'
	if (status === 'RECONNECTING') return '重连中'
	if (status === 'CHANNEL_ERROR') return '连接错误'
	if (status === 'TIMED_OUT') return '连接超时'
	if (status === 'CLOSED') return '已断开'
	if (status === 'NO_USER') return '未登录'
	return '未连接'
})

// 底栏只呈现一条最要紧的同步状态：断线 > 待同步 > 连接中 > 已同步
const syncState = computed(() => {
	const status = String(todoStore.realtimeStatus || 'UNKNOWN').toUpperCase()
	if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
		return { label: '连接异常', dot: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400' }
	}
	if (hasUnsyncedChanges.value) {
		return { label: '待同步', dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' }
	}
	if (status === 'CONNECTING' || status === 'RECONNECTING') {
		return { label: '连接中', dot: 'bg-amber-500', text: 'text-neutral-500 dark:text-neutral-400' }
	}
	if (status === 'SUBSCRIBED') {
		return { label: '已同步', dot: 'bg-emerald-600 dark:bg-emerald-400', text: 'text-neutral-500 dark:text-neutral-400' }
	}
	return { label: '未连接', dot: 'bg-neutral-300 dark:bg-neutral-600', text: 'text-neutral-500 dark:text-neutral-400' }
})

const viewProps = computed(() => {
	if (activeView.value === 'schedule') return { selectedEventId: selectedEventId.value }
	if (activeView.value === 'heap') return { todos: todoStore.todos }
	return {}
})

const handleSelectedIdReplaced = (event) => {
	const { tempId, realId } = event.detail || {}
	if (tempId == null || realId == null) return

	if (selectedTaskId.value == tempId) {
		selectedTaskId.value = realId
	}
}

const openDetailPanel = () => {
	showDetailPanel.value = true
}

// 关闭详情面板（大屏/小屏通用）
const closeDetailPanel = () => {
	showDetailPanel.value = false
}

const toggleDetailPanel = () => {
	showDetailPanel.value = !showDetailPanel.value
}

// AI 视图下同一位置承载对话上下文，日程视图承载选中日程，其他视图仍是任务详情
const detailPanelToggleLabel = computed(() => {
	if (activeView.value === 'ai') {
		return showDetailPanel.value ? '隐藏对话上下文' : '显示对话上下文'
	}
	if (activeView.value === 'schedule') {
		return showDetailPanel.value ? '隐藏日程详情' : '显示日程详情'
	}
	return showDetailPanel.value ? '隐藏详情面板' : '显示详情面板'
})

provide(TODO_DETAIL_PANEL_CONTEXT, {
	openDetailPanel
})

// 页面离开警告处理
// 跨过桌面/窄屏阈值时自动切换侧栏，窄屏不遮住清单
let lastWindowWidth = typeof window === 'undefined' ? SIDEBAR_FLOAT_BREAKPOINT : window.innerWidth
const handleWindowResize = () => {
	const width = window.innerWidth
	windowWidth.value = width
	if (width < SIDEBAR_FLOAT_BREAKPOINT && lastWindowWidth >= SIDEBAR_FLOAT_BREAKPOINT) showLeftSidebar.value = false
	if (width >= SIDEBAR_FLOAT_BREAKPOINT && lastWindowWidth < SIDEBAR_FLOAT_BREAKPOINT) showLeftSidebar.value = true
	lastWindowWidth = width
}

const handleBeforeUnload = (e) => {
	if (hasUnsyncedChanges.value) {
		e.preventDefault()
		e.returnValue = '有更改尚未保存到服务器，确定离开吗？'
		return e.returnValue
	}
}

onMounted(async () => {
	// 导航处于收起状态时，侧栏不能单独浮在外面
	if (!showActivityRail.value) showLeftSidebar.value = false
	// 确保认证初始化完成
	await authStore.initAuth()

	// 如果已登录，同时拉取待办与回收站，避免进入回收站时再等一次网络
	if (authStore.isAuthenticated) {
		await Promise.all([todoStore.fetchTodos(), todoStore.ensureTrashFetched()])
		// 初始化 Realtime 订阅
		todoStore.setupRealtimeSubscription()
	}
	// 添加事件监听器
	document.addEventListener('click', handleClickOutside)
	window.addEventListener('beforeunload', handleBeforeUnload)
	window.addEventListener('resize', handleWindowResize)
	window.addEventListener('sync:id-replaced', handleSelectedIdReplaced)
	nextTick(restoreMainScroll)
})

// 数据到达后滚动目标才算有效，再落位一次；顺带清理已不存在的选中任务
watch(() => todoStore.isFetched, (fetched) => {
	if (!fetched) return
	if (selectedTaskId.value != null
		&& !todoStore.findTodoById(selectedTaskId.value)
		&& !todoStore.trashTodos.some(todo => todo.id === selectedTaskId.value)) {
		selectedTaskId.value = null
	}
	nextTick(restoreMainScroll)
}, { immediate: true })

// 监听路由变化，确保数据总是最新的
watch(
	() => route.name,
	async (newRouteName) => {
		// 检查是否是 Todo 相关页面（包括子路由）
		const isTodoPage = newRouteName && (
			newRouteName === 'app' ||
			newRouteName === 'App' ||
			String(newRouteName).includes('View')
		)

		if (authStore.isAuthenticated && isTodoPage) {
			// 确保数据已经获取过
			if (!todoStore.isFetched && !todoStore.loading) {
				await todoStore.fetchTodos()
			}
		}
	},
	{ immediate: true } // 立即执行一次，确保首次进入页面也会触发
)

const handleSignOut = async () => {
	const result = await authStore.signOut()
	router.push({ name: 'login' })
}

const openSettings = () => {
	settingsPanelOpen.value = true
	showUserMenu.value = false
}

const switchView = (view) => {
	activeView.value = view
}

const handleTaskSelected = (taskId) => {
	if (taskId === null) {
		closeDetailPanel()
		selectedTaskId.value = null
	} else if (selectedTaskId.value === taskId) {
	} else {
		selectedTaskId.value = taskId
		if (window.innerWidth > 1024) {
			showDetailPanel.value = true
		}
	}
	console.log('选中任务ID:', taskId)
}

// 日程选中：右栏编辑该日程，窄屏时一并展开面板
const handleEventSelected = (eventId) => {
	if (eventId == null) {
		selectedEventId.value = null
		closeDetailPanel()
		return
	}
	selectedEventId.value = eventId
	if (window.innerWidth > 1024) {
		showDetailPanel.value = true
	}
}

// 创建新任务
const createNewTask = async () => {
	try {
		const result = await todoStore.addTodo('新任务', {
			details: ''
		})
		if (result) {
			selectedTaskId.value = result.id
			if (window.innerWidth > 1024) {
				showDetailPanel.value = true
			}
		}
	} catch (error) {
		console.error('创建任务失败:', error)
	}
}

// 浮层侧栏：窄屏抽屉或任务图覆盖模式，点击外部应自动收起
const isSidebarFloating = computed(() => activeView.value === 'graph' || windowWidth.value < SIDEBAR_FLOAT_BREAKPOINT)

// 右栏在窄屏同样浮在内容之上，宽屏才挤压中栏
const isDetailPanelFloating = computed(() => windowWidth.value < SIDEBAR_FLOAT_BREAKPOINT)

// 点击外部关闭用户菜单与浮层侧栏
const handleClickOutside = (event) => {
	if (userMenuRef.value && !userMenuRef.value.contains(event.target)) {
		if (!event.target.closest('[data-user-menu-trigger]')) {
			showUserMenu.value = false
		}
	}
	if (showLeftSidebar.value && isSidebarFloating.value) {
		const insideSidebar = event.target.closest?.('[data-left-sidebar]')
		const insideRail = event.target.closest?.('[data-activity-rail]')
		if (!insideSidebar && !insideRail) {
			showLeftSidebar.value = false
		}
	}
	// 窄屏右栏浮在内容之上，点击面板外收起
	if (showDetailPanel.value && isDetailPanelFloating.value) {
		const insidePanel = event.target.closest?.('[data-detail-panel]')
		const insideTrigger = event.target.closest?.('[data-detail-panel-trigger]')
		if (!insidePanel && !insideTrigger) closeDetailPanel()
	}
}

// 点击中栏区域时关闭详情面板（如果点击的不是任务项）
const onMainAreaClick = (e) => {
	// 检查是否点击了任务项（带有 data-task-item 属性的元素）
	const clickedTaskItem = e.target.closest('[data-task-item]')
	// 检查是否点击了详情面板
	const clickedDetailPanel = e.target.closest('[data-detail-panel]')

	// 如果没有点击任务项也没有点击详情面板，则关闭详情面板
	if (!clickedTaskItem && !clickedDetailPanel) {
		//closeDetailPanel()
		selectedTaskId.value = null
	}
}


onUnmounted(() => {
	document.removeEventListener('click', handleClickOutside)
	// 清理 Realtime 订阅
	todoStore.cleanupRealtimeSubscription()
	// 移除页面离开警告
	window.removeEventListener('beforeunload', handleBeforeUnload)
	window.removeEventListener('resize', handleWindowResize)
	window.removeEventListener('sync:id-replaced', handleSelectedIdReplaced)
	// 离开应用页时收起设置浮窗，避免下次进入时残留
	settingsPanelOpen.value = false
	if (toastTimer) clearTimeout(toastTimer)
})

// 轻提示：删除、完成、批量操作后给出结果，并允许撤销
const toast = ref({ visible: false, message: '', undo: null })
let toastTimer = null

const hideToast = () => {
	toast.value = { visible: false, message: '', undo: null }
}

const showToast = (message, undo = null) => {
	if (toastTimer) clearTimeout(toastTimer)
	toast.value = { visible: true, message, undo }
	toastTimer = setTimeout(hideToast, undo ? 6000 : 3000)
}

const handleNotify = (payload) => {
	if (!payload?.message) return
	showToast(payload.message, payload.undo || null)
}

const runToastUndo = async () => {
	const undo = toast.value.undo
	hideToast()
	if (undo) await undo()
}
</script>


<template>
	<!-- 主界面 -->
	<div class="h-screen flex flex-col overflow-hidden">
		<!-- 主内容区 -->
		<div class="relative flex-1 min-w-0 min-h-0 flex overflow-hidden">
			<!-- 左侧活动栏：顶部 Logo 回主页，收起开关在底栏 -->
			<aside v-if="showActivityRail" data-activity-rail
				class="w-12 shrink-0 bg-accent-700 dark:bg-accent-900 flex flex-col items-center">
				<!-- 品牌区：与顶栏同高，下边框与顶栏底边对齐 -->
				<div class="h-12 w-full flex items-center justify-center border-b border-white/20">
					<RouterLink to="/" title="回到主页" class="h-full w-full flex items-center justify-center">
						<img :src="logoSrc" alt="TodoHeap" class="h-7 w-7" />
					</RouterLink>
				</div>

				<!-- 主入口：清单 / 日程 / AI，占据中部剩余空间 -->
				<nav class="flex flex-1 flex-col items-center w-full" aria-label="主导航">
					<button v-for="entry in navEntries" :key="entry.id" @click="openNavEntry(entry)"
						:title="entry.label" :aria-label="entry.label" :aria-current="isNavEntryActive(entry.id) ? 'true' : undefined"
						:class="[
							'w-full aspect-square flex items-center justify-center transition-colors',
							isNavEntryActive(entry.id)
								? 'bg-white/20 text-white'
								: 'text-white/70 hover:bg-white/15 hover:text-white'
						]">
						<span v-if="entry.id === 'ai'" class="text-xs font-semibold tracking-tight">AI</span>
						<AppIcon v-else :name="entry.icon" :size="18" />
					</button>
				</nav>

				<!-- 账户与设置：贴底独立成组，与主入口用分隔线区隔 -->
				<div class="flex w-full flex-col items-center border-t border-white/20">
					<div class="relative w-full">
						<button data-user-menu-trigger @click="showUserMenu = !showUserMenu"
							class="w-full aspect-square flex items-center justify-center text-white/80 hover:bg-white/15 hover:text-white transition-colors"
							title="用户菜单">
							<AppIcon name="user" :size="18" />
						</button>
						<Transition enter-active-class="transition ease-out duration-100"
							enter-from-class="opacity-0 scale-95" enter-to-class="opacity-100 scale-100"
							leave-active-class="transition ease-in duration-75" leave-from-class="opacity-100 scale-100"
							leave-to-class="opacity-0 scale-95">
							<div v-if="showUserMenu" ref="userMenuRef"
								class="absolute left-full bottom-0 ml-2 w-56 panel shadow-lg z-50 overflow-hidden">
								<p
									class="px-3 py-2 text-xs text-neutral-500 border-b border-hairline dark:border-hairline-dark truncate">
									{{ authStore.user?.email || '未登录' }}
								</p>
								<button @click="handleSignOut"
									class="w-full px-3 py-2 flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-accent-50 dark:hover:bg-accent-500/10 transition-colors">
									<AppIcon name="logout" />
									<span>退出登录</span>
								</button>
							</div>
						</Transition>
					</div>

					<button @click="openSettings"
						class="w-full aspect-square flex items-center justify-center text-white/80 hover:bg-white/15 hover:text-white transition-colors"
						title="设置">
						<AppIcon name="sliders" :size="18" />
					</button>
				</div>
			</aside>

			<!-- 左栏：任务导航面板；任务图下覆盖在导图之上，避免改变导图宽度 -->
			<LeftSidebar :show="showLeftSidebar" :active-view="activeView" :selected-task-id="selectedTaskId"
				:section="activeSection"
				:overlay="activeView === 'graph'"
				:rail-hidden="!showActivityRail"
				@close="() => { showLeftSidebar = false }" @switch-view="switchView" @create-task="createNewTask"
				/>

			<!-- 中栏：统一顶栏 + 主要视图内容 -->
			<div class="flex-1 flex flex-col min-w-0 min-h-0">
				<!-- 顶栏：承载当前视图标题，页面操作入口通过 Teleport 注入右侧 -->
				<header
					class="h-12 shrink-0 border-b border-hairline bg-canvas dark:border-hairline-dark dark:bg-canvas-dark">
					<div class="flex h-full items-center gap-3 px-3 @container">
						<!-- 导航收起后，从底栏开回 -->
						<h1
							class="shrink-0 whitespace-nowrap text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
							{{ activeViewTitle }}
						</h1>
						<!-- 中栏被详情面板挤窄时，视图自己的操作先让位，保留全局面板开关 -->
						<div class="ml-auto flex min-w-0 items-center gap-2">
							<div id="main-topbar-actions"
								class="flex min-w-0 items-center gap-2 @max-[440px]:hidden"></div>
							<button type="button" data-detail-panel-trigger
								class="h-7 w-7 shrink-0 rounded-md flex items-center justify-center transition-colors"
								:class="showDetailPanel
									? 'bg-accent-50 text-accent-800 dark:bg-accent-500/15 dark:text-accent-200'
									: 'text-neutral-500 hover:bg-accent-50 hover:text-accent-800 dark:text-neutral-400 dark:hover:bg-accent-500/10 dark:hover:text-accent-200'"
								:title="detailPanelToggleLabel" :aria-pressed="showDetailPanel" @click="toggleDetailPanel">
								<AppIcon name="panelRight" :size="15" />
							</button>
						</div>
					</div>
				</header>

				<!-- 清单内容 -->
				<div ref="mainScrollRef" class="flex-1 min-h-0" :class="['graph', 'ai'].includes(activeView) ? 'overflow-hidden' : 'overflow-auto'"
					@scroll.passive="saveMainScroll" @click="onMainAreaClick">
					<div v-if="showViewLoading" class="flex items-center justify-center h-96 meta-text">
						<span class="inline-flex items-center gap-2">
							<AppIcon name="loader" class="animate-spin" />
							加载视图…
						</span>
					</div>
					<template v-else>
						<div :class="activeView === 'graph'
							? 'h-full'
							: activeView === 'ai'
								? 'mx-auto max-w-3xl w-full px-6 pb-4 h-full flex flex-col min-h-0'
								: activeView === 'trash'
									? 'mx-auto flex h-full max-w-3xl w-full flex-col px-8 pt-4 pb-6'
									: activeView === 'schedule'
										? 'mx-auto max-w-3xl w-full px-8 pt-4 pb-6'
										: 'mx-auto max-w-3xl w-full px-8 pb-6'">
							<router-view v-slot="{ Component }">
								<component :is="Component" v-bind="viewProps" :selected-task-id="selectedTaskId"
									@task-selected="handleTaskSelected" @event-selected="handleEventSelected"
									@notify="handleNotify" @open-sidebar="showLeftSidebar = true" />
							</router-view>
						</div>
					</template>
				</div>
			</div>

			<!-- 右栏：窄屏浮在内容之上，宽屏挤压中栏 -->
			<div :class="isDetailPanelFloating && showDetailPanel
				? 'absolute inset-y-0 right-0 z-30 flex max-w-[85vw] shadow-lg'
				: 'flex'">
				<AgentContextPanel v-if="activeView === 'ai'" :show="showDetailPanel"
					:selected-task-id="selectedTaskId" @close="closeDetailPanel" />
				<ScheduleDetailPanel v-else-if="activeView === 'schedule'" :show="showDetailPanel"
					:event-id="selectedEventId" @close="closeDetailPanel"
					@event-deleted="selectedEventId = null" />
				<TodoDetailEditor v-else :todo-id="selectedTaskId" :show="showDetailPanel" @close="closeDetailPanel"
					@task-selected="handleTaskSelected" />
			</div>
		</div>

		<!-- 底栏：统计可折叠于其上，状态栏常驻 -->
		<div
			class="shrink-0 border-t border-hairline bg-surface dark:border-hairline-dark dark:bg-surface-dark">
			<!-- 统计面板：默认折叠，从底栏向上展开 -->
			<div v-if="statsExpanded" class="px-3 pt-2.5 pb-2">
				<div class="grid grid-cols-3 gap-3">
					<div class="flex items-baseline justify-between text-[11px]">
						<span class="text-neutral-500 dark:text-neutral-400">总任务</span>
						<span class="font-mono font-semibold text-neutral-900 dark:text-neutral-100">{{ taskStats.total }}</span>
					</div>
					<div class="flex items-baseline justify-between text-[11px]">
						<span class="text-neutral-500 dark:text-neutral-400">已完成</span>
						<span class="font-mono text-accent-700 dark:text-accent-400">{{ taskStats.completed }}</span>
					</div>
					<div class="flex items-baseline justify-between text-[11px]">
						<span class="text-neutral-500 dark:text-neutral-400">进行中</span>
						<span class="font-mono font-semibold text-neutral-900 dark:text-neutral-100">{{ taskStats.pending }}</span>
					</div>
				</div>
				<div class="mt-2 h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
					<div class="h-full rounded-full bg-accent-500 transition-[width] duration-300"
						:style="{ width: completionRate + '%' }"></div>
				</div>
			</div>

			<!-- 状态栏：导航开关、当前视图与全局进度、同步状态 -->
			<div
				class="h-8 px-3 flex items-center justify-between gap-3 text-[11px] text-neutral-500 dark:text-neutral-400 select-none">
				<div class="flex items-center gap-2.5 min-w-0">
					<!-- 导航开关：常驻底栏，收起后仍可从这里开回 -->
					<button type="button"
						:title="showActivityRail ? '收起导航' : '显示导航'"
						@click="showActivityRail ? collapseNavigation() : expandNavigation()"
						class="h-6 w-6 shrink-0 rounded-md flex items-center justify-center transition-colors"
						:class="showActivityRail
							? 'text-neutral-500 hover:bg-accent-50 hover:text-accent-800 dark:text-neutral-400 dark:hover:bg-accent-500/10 dark:hover:text-accent-200'
							: 'bg-accent-50 text-accent-800 dark:bg-accent-500/15 dark:text-accent-200'">
						<AppIcon name="sidebar" :size="14" />
					</button>
					<span class="shrink-0 font-medium text-neutral-700 dark:text-neutral-300">{{ activeViewTitle }}</span>
					<template v-if="taskStats.total">
						<span class="h-3 w-px shrink-0 bg-hairline dark:bg-hairline-dark"></span>
						<span class="shrink-0 font-mono tabular-nums" title="未完成 / 全部任务">
							<span class="text-neutral-700 dark:text-neutral-300">{{ taskStats.pending }}</span>
							<span class="px-0.5 text-neutral-400 dark:text-neutral-600">/</span>{{ taskStats.total }}
						</span>
						<span class="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700"
							:title="'已完成 ' + completionRate + '%'">
							<span class="block h-full rounded-full bg-accent-500 transition-[width] duration-300"
								:style="{ width: completionRate + '%' }"></span>
						</span>
						<span class="shrink-0 font-mono tabular-nums text-accent-700 dark:text-accent-400"
							title="已完成比例">{{ completionRate }}%</span>
					</template>
					<!-- 统计开关：文字入口，向上展开明细 -->
					<button type="button"
						:title="statsExpanded ? '收起统计' : '展开统计'" :aria-expanded="statsExpanded"
						@click="statsExpanded = !statsExpanded"
						class="h-6 shrink-0 rounded-md px-1.5 flex items-center gap-1 transition-colors"
						:class="statsExpanded
							? 'bg-accent-50 text-accent-800 dark:bg-accent-500/15 dark:text-accent-200'
							: 'text-neutral-500 hover:bg-accent-50 hover:text-accent-800 dark:text-neutral-400 dark:hover:bg-accent-500/10 dark:hover:text-accent-200'">
						<AppIcon name="chart" :size="13" />
						<span>统计</span>
						<AppIcon :name="statsExpanded ? 'chevronDown' : 'chevronUp'" :size="10" class="opacity-70" />
					</button>
				</div>
				<span class="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1" :class="syncState.text"
					:title="'实时连接：' + realtimeStatusLabel + ' · ' + syncStatusLabel">
					<span class="h-1.5 w-1.5 rounded-full" :class="syncState.dot"></span>
					{{ syncState.label }}
				</span>
			</div>
		</div>

		<!-- 设置浮窗：覆盖在当前视图之上，不打断任务操作 -->
		<Settings v-if="settingsPanelOpen" floating @close="settingsPanelOpen = false" />

		<!-- 操作反馈：带撤销入口的轻提示 -->
		<Transition name="fade">
			<div v-if="toast.visible"
				class="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 panel px-3 py-2 shadow-lg">
				<span class="text-sm text-neutral-700 dark:text-neutral-300">{{ toast.message }}</span>
				<button v-if="toast.undo" type="button"
					class="flex items-center gap-1 text-sm font-medium text-accent-700 hover:underline dark:text-accent-400"
					@click="runToastUndo">
					<AppIcon name="undo" :size="14" />
					撤销
				</button>
				<button type="button" class="p-0.5 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
					title="关闭提示" @click="hideToast">
					<AppIcon name="close" :size="13" />
				</button>
			</div>
		</Transition>
	</div>
</template>
