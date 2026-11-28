<script setup>

import { ref, onMounted, computed, watch, onUnmounted, provide, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useTodoStore } from '@/stores/todos'
import { useSyncQueueStore } from '@/stores/syncQueue'
import { useScheduleStore } from '@/stores/schedules'
import { storeToRefs } from 'pinia'
import LeftSidebar from '@/components/LeftSidebar.vue'
import AppIcon from '@/components/AppIcon.vue'
import TodoDetailEditor from '@/components/TodoDetailEditor.vue'
import AgentContextPanel from '@/components/AgentContextPanel.vue'
import ScheduleDetailPanel from '@/components/ScheduleDetailPanel.vue'
import SyncStatusIndicator from '@/components/SyncStatusIndicator.vue'
import {
	TODO_DETAIL_PANEL_CONTEXT,
	detailPanelWidth,
	detailPanelInset
} from '@/utils/detailPanelContext'
import Settings from '@/pages/todo/Settings.vue'
import { settingsPanelOpen, isValidSettingsTab } from '@/utils/settingsPanel'
import { persistedRef, useScrollMemory, SIDEBAR_FLOAT_BREAKPOINT } from '@/utils/uiState'
import { THEME_KEY, THEME_MODES, THEME_OPTIONS, normalizeThemeMode, nextThemeMode } from '@/utils/theme'
import { childTitlesOf, nextTaskTitle } from '@/utils/taskTitle'
import logoSrc from '@/assets/logo.svg'

// 应用挂在 /TodoHeap/app/，站点首页在去掉 app/ 后的根路径
const siteHomeUrl = import.meta.env.BASE_URL.replace(/app\/?$/, '')

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const todoStore = useTodoStore()
const syncQueueStore = useSyncQueueStore()
const scheduleStore = useScheduleStore()

// 获取同步队列状态
const { hasUnsyncedChanges } = storeToRefs(syncQueueStore)

const userMenuRef = ref(null)

// 顶栏主题按钮：与 Agent 共用同一个界面偏好，悬停展开下拉菜单选 自动/浅色/深色
const themeMode = persistedRef(THEME_KEY, 'auto', {
	validate: (value) => THEME_MODES.includes(value)
})
const themeMenuRef = ref(null)
const showThemeMenu = ref(false)
const currentThemeOption = computed(
	() => THEME_OPTIONS.find((option) => option.value === normalizeThemeMode(themeMode.value)) || THEME_OPTIONS[0]
)
const themeToggleLabel = computed(() => `主题：${currentThemeOption.value.label}`)
const openThemeMenu = () => {
	showThemeMenu.value = true
}
const closeThemeMenu = () => {
	showThemeMenu.value = false
}
const selectTheme = (mode) => {
	themeMode.value = mode
	closeThemeMenu()
}
// 点击按钮直接换主题：浅色 → 深色 → 自动，面板保持展开显示当前档位
const cycleTheme = () => {
	themeMode.value = nextThemeMode(themeMode.value)
}
// 有精确指针时点击循环并保持面板；触屏与键盘激活只展开面板，保证三档都能选
const handleThemeToggleClick = (event) => {
	const hoverCapable = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches !== false
	if (event.detail === 0 || !hoverCapable) {
		openThemeMenu()
		return
	}
	cycleTheme()
	openThemeMenu()
}

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
// 右栏宽度与浮层占位宽度是共享状态：面板拖宽、任务图避让都读同一份
// 日程视图的右栏编辑选中的日程，与其他视图的任务选中互不干扰
const selectedEventId = persistedRef('selected-event', null, {
	validate: (value) => value === null || Number.isFinite(value)
})
const windowWidth = ref(window.innerWidth)
const isNarrowScreen = computed(() => windowWidth.value < SIDEBAR_FLOAT_BREAKPOINT)
// 宽屏侧栏是常驻栏：开合由用户手动选择，跨会话沿用
const sidebarPreferredOpen = persistedRef('sidebar-open', window.innerWidth >= SIDEBAR_FLOAT_BREAKPOINT)
// 窄屏侧栏是覆盖内容的抽屉：只在当次打开，收窄时自动关，不覆盖宽屏偏好
const sidebarDrawerOpen = ref(false)
// 实际显示状态：宽度只决定用哪套状态，跨过断点不再改写用户选择
const showLeftSidebar = computed({
	get: () => (isNarrowScreen.value ? sidebarDrawerOpen.value : sidebarPreferredOpen.value),
	set: (open) => {
		if (isNarrowScreen.value) sidebarDrawerOpen.value = open
		else sidebarPreferredOpen.value = open
	}
})
// 活动栏显示状态：收起后由顶栏按钮开回
const showActivityRail = persistedRef('rail-open', true)

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

// 底栏统计：全局完成进度，侧栏收起时也能一眼看到；根任务不计入
const taskStats = computed(() => {
	const list = todoStore.tasks
	const completed = list.filter(todo => todo.completed_at).length
	return { total: list.length, completed, pending: list.length - completed }
})

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
	showLeftSidebar.value = !isNarrowScreen.value
}

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

// 底栏只呈现一条最要紧的同步状态：断线 > 日程写入失败 > 待同步 > 同步中 > 已同步
const syncState = computed(() => {
	const status = String(todoStore.realtimeStatus || 'UNKNOWN').toUpperCase()
	if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
		return { status: 'error', label: '连接异常' }
	}
	if (scheduleStore.syncStatus === 'error') {
		return { status: 'error', label: '同步失败' }
	}
	if (hasUnsyncedChanges.value) return { status: 'pending' }
	if (scheduleStore.syncStatus === 'saving') return { status: 'saving' }
	if (status === 'CONNECTING' || status === 'RECONNECTING') {
		return { status: 'saving', label: '连接中' }
	}
	if (status === 'SUBSCRIBED') return { status: 'idle' }
	return { status: 'offline' }
})

const syncStatusTitle = computed(() => {
	const parts = [`实时连接：${realtimeStatusLabel.value}`]
	if (hasUnsyncedChanges.value) parts.push('有待同步的任务更改')
	if (scheduleStore.syncStatus === 'error') parts.push(`日程同步失败：${scheduleStore.syncError}`)
	if (scheduleStore.syncStatus === 'saving') parts.push('日程同步中')
	return parts.join(' · ')
})

const viewProps = computed(() => {
	if (activeView.value === 'schedule') return { selectedEventId: selectedEventId.value }
	if (activeView.value === 'heap') return { todos: todoStore.tasks }
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
// 跨过桌面/窄屏阈值时只处理抽屉：收窄会把侧栏变成浮层，先关上避免盖住清单；
// 放宽时按宽屏偏好还原，不因宽度变化强行展开
let lastWindowWidth = typeof window === 'undefined' ? SIDEBAR_FLOAT_BREAKPOINT : window.innerWidth
const handleWindowResize = () => {
	const width = window.innerWidth
	const wasWide = lastWindowWidth >= SIDEBAR_FLOAT_BREAKPOINT
	windowWidth.value = width
	if (wasWide && width < SIDEBAR_FLOAT_BREAKPOINT) sidebarDrawerOpen.value = false
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
	document.addEventListener('keydown', handleKeydown)
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

// 关闭设置浮窗：地址栏里的标签参数一并清掉，链接回到当前视图
const closeSettings = () => {
	settingsPanelOpen.value = false
	if (!route.query.tab) return
	const query = { ...route.query }
	delete query.tab
	router.replace({ query })
}

// 地址栏带合法的 tab 时直接打开浮窗：刷新或分享链接都能回到同一个设置面板
watch(
	() => route.query.tab,
	(tab) => {
		if (isValidSettingsTab(tab)) settingsPanelOpen.value = true
	},
	{ immediate: true }
)

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
		// 任务图选中节点也算离开浮层导航，收起侧栏避免挡住画布
		if (showLeftSidebar.value && isSidebarFloating.value) showLeftSidebar.value = false
		if (window.innerWidth > 1024) {
			showDetailPanel.value = true
		}
	}
	console.log('选中任务ID:', taskId)
}

// 任务行菜单「在任务图中查看」：选中该任务并切到任务图。
// 带 focus 查询是为了让图在挂载后定位节点：图挂载时已存在的选中态不会触发可见性修正
const jumpToGraph = (taskId) => {
	const id = Number(taskId)
	if (!Number.isFinite(id)) return
	handleTaskSelected(id)
	router.push({ name: 'GraphView', query: { focus: String(id) } })
}

// 画布空白点击等同于点击浮层外部：收起浮在画布上的导航与详情右栏
const handleCanvasBackgroundClick = () => {
	if (showLeftSidebar.value && isSidebarFloating.value) showLeftSidebar.value = false
	if (showDetailPanel.value && isDetailPanelFloating.value) closeDetailPanel()
}

// 日程选中：无条件展开右栏编辑该日程；窄屏时右栏浮在内容之上
const handleEventSelected = (eventId) => {
	if (eventId == null) {
		selectedEventId.value = null
		closeDetailPanel()
		return
	}
	selectedEventId.value = eventId
	showDetailPanel.value = true
}

// 日程保存成功：收起右栏并清掉选中，列表回到未选状态
const handleScheduleSaved = () => {
	selectedEventId.value = null
	closeDetailPanel()
}

// 创建新任务
const createNewTask = async () => {
	try {
		// 顶层任务连续新建时按根任务 child_ids 自动编号
		const title = nextTaskTitle(null, childTitlesOf(todoStore.todos, todoStore.rootTaskId))
		const result = await todoStore.addTodo(title, {
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

// 任务图固定浮层，其他视图窄屏浮层：两者都算浮在内容之上
const isDetailPanelFloating = computed(() => activeView.value === 'graph' || isNarrowScreen.value)

// 浮在任务图上的右栏宽度：导图据此把选中节点与菜单留在可见区，窄屏受 85vw 上限约束
const graphPanelInset = computed(() => {
	if (activeView.value !== 'graph' || !showDetailPanel.value) return 0
	return Math.min(detailPanelWidth.value, Math.round(windowWidth.value * 0.85))
})

// 把占位宽度同步给导图：面板开合、拖宽或视口变化时一起更新
watch(graphPanelInset, (value) => { detailPanelInset.value = value }, { immediate: true })

// 点击外部关闭用户菜单、主题菜单与浮层侧栏
const handleClickOutside = (event) => {
	if (userMenuRef.value && !userMenuRef.value.contains(event.target)) {
		if (!event.target.closest('[data-user-menu-trigger]')) {
			showUserMenu.value = false
		}
	}
	if (showThemeMenu.value) {
		const insideMenu = themeMenuRef.value?.contains(event.target)
		if (!insideMenu && !event.target.closest?.('[data-theme-toggle]')) {
			showThemeMenu.value = false
		}
	}
	if (showLeftSidebar.value && isSidebarFloating.value) {
		const insideSidebar = event.target.closest?.('[data-left-sidebar]')
		const insideRail = event.target.closest?.('[data-activity-rail]')
		if (!insideSidebar && !insideRail) {
			showLeftSidebar.value = false
		}
	}
	// 日程视图：点非日程区域清掉选中并收起右栏，宽屏停靠时同样生效
	if (activeView.value === 'schedule' && selectedEventId.value != null) {
		const insidePanel = event.target.closest?.('[data-detail-panel]')
		const insideSchedule = event.target.closest?.('[data-keep-detail-panel]')
		const insideTrigger = event.target.closest?.('[data-detail-panel-trigger]')
		const insidePicker = event.target.closest?.('[data-date-picker-panel]')
		if (!insidePanel && !insideSchedule && !insideTrigger && !insidePicker) {
			selectedEventId.value = null
			closeDetailPanel()
		}
	}
	// 浮层右栏点击面板外收起；任务图里点画布由导图自己处理选中与关闭
	// 日程列表项与新建入口会主动展开右栏，同一次点击不能又把它收起
	if (showDetailPanel.value && isDetailPanelFloating.value) {
		const insidePanel = event.target.closest?.('[data-detail-panel]')
		const insideTrigger = event.target.closest?.('[data-detail-panel-trigger]')
		const insideSchedule = event.target.closest?.('[data-keep-detail-panel]')
		const insidePicker = event.target.closest?.('[data-date-picker-panel]')
		if (!insidePanel && !insideTrigger && !insideSchedule && !insidePicker) closeDetailPanel()
	}
}

// 主题菜单：Esc 收起，与点击外部关闭同一份状态
const handleKeydown = (event) => {
	if (event.key === 'Escape' && showThemeMenu.value) showThemeMenu.value = false
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
	document.removeEventListener('keydown', handleKeydown)
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

// 轻提示：删除、完成、批量操作后给出结果，并允许撤销或切换到另一种处理方式
const toast = ref({ visible: false, message: '', undo: null, action: null })
let toastTimer = null

const hideToast = () => {
	toast.value = { visible: false, message: '', undo: null, action: null }
}

const showToast = (message, undo = null, action = null) => {
	if (toastTimer) clearTimeout(toastTimer)
	toast.value = { visible: true, message, undo, action }
	toastTimer = setTimeout(hideToast, undo || action ? 6000 : 3000)
}

const handleNotify = (payload) => {
	if (!payload?.message) return
	showToast(payload.message, payload.undo || null, payload.action || null)
}

const runToastUndo = async () => {
	const undo = toast.value.undo
	hideToast()
	if (undo) await undo()
}

const runToastAction = async () => {
	const action = toast.value.action
	hideToast()
	if (action?.run) await action.run()
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
					<a :href="siteHomeUrl" title="回到首页" class="h-full w-full flex items-center justify-center">
						<img :src="logoSrc" alt="TodoHeap" class="h-7 w-7" />
					</a>
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
						<!-- 中栏被详情面板挤窄时，视图自己的操作先让位，保留全局开关 -->
						<div class="ml-auto flex min-w-0 items-center gap-2">
							<div id="main-topbar-actions"
								class="flex min-w-0 items-center gap-2 @max-[440px]:hidden"></div>
							<!-- 「顶栏主题按钮」：悬停即展开菜单，点击循环 浅色→深色→自动 并保持面板展开；触屏与键盘点击只展开菜单（图标是当前模式） -->
							<div class="relative" @mouseenter="openThemeMenu" @mouseleave="closeThemeMenu">
								<button type="button" data-theme-toggle aria-haspopup="menu"
									:aria-expanded="showThemeMenu"
									class="h-7 w-7 shrink-0 rounded-md flex items-center justify-center transition-colors text-neutral-500 hover:bg-accent-50 hover:text-accent-800 dark:text-neutral-400 dark:hover:bg-accent-500/10 dark:hover:text-accent-200"
									:title="themeToggleLabel" :aria-label="themeToggleLabel" @click="handleThemeToggleClick">
									<AppIcon :name="currentThemeOption.icon" :size="15" />
								</button>
								<!-- 下拉菜单：外层 pt-1 当间距，鼠标从按钮移到面板不会离开悬停区；宽度由菜单项内容撑开，面板与按钮水平居中对齐 -->
								<div v-if="showThemeMenu"
									class="absolute left-1/2 top-full -translate-x-1/2 pt-1 z-40">
									<div ref="themeMenuRef" role="radiogroup" aria-label="主题"
										class="panel shadow-lg py-1 overflow-hidden w-fit">
										<button v-for="option in THEME_OPTIONS" :key="option.value" type="button"
											role="radio" :aria-checked="themeMode === option.value"
											class="w-full px-3 py-1.5 flex items-center justify-center gap-2 whitespace-nowrap text-sm transition-colors"
											:class="themeMode === option.value
												? 'bg-accent-50 text-accent-800 dark:bg-accent-500/10 dark:text-accent-200'
												: 'text-neutral-700 hover:bg-accent-50 dark:text-neutral-300 dark:hover:bg-accent-500/10'"
											@click="selectTheme(option.value)">
											<AppIcon :name="option.icon" :size="13" />
											<span>{{ option.label }}</span>
										</button>
									</div>
								</div>
							</div>
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
									@task-selected="handleTaskSelected" @jump-to-graph="jumpToGraph"
									@event-selected="handleEventSelected"
									@notify="handleNotify" @open-sidebar="showLeftSidebar = true"
									@background-click="handleCanvasBackgroundClick" />
							</router-view>
						</div>
					</template>
				</div>
			</div>

			<!-- 任务图：画布保持整宽；右栏浮在右侧，空白区由 flex 自然让出 -->
			<div v-if="activeView === 'graph'" class="pointer-events-none absolute inset-0 z-30 flex">
				<!-- 空白区只负责占位，画布仍在下面铺满整宽 -->
				<div class="min-w-0 flex-1"></div>
				<div v-if="showDetailPanel" class="pointer-events-auto flex max-w-[85vw] shadow-lg">
					<TodoDetailEditor :todo-id="selectedTaskId" :show="true" @close="closeDetailPanel"
						@task-selected="handleTaskSelected" />
				</div>
			</div>

			<!-- 其他视图右栏：窄屏浮在内容之上，宽屏挤压中栏 -->
			<div v-else :class="isDetailPanelFloating && showDetailPanel
				? 'absolute inset-y-0 right-0 z-30 flex max-w-[85vw] shadow-lg'
				: 'flex'">
				<AgentContextPanel v-if="activeView === 'ai'" :show="showDetailPanel"
					:selected-task-id="selectedTaskId" @close="closeDetailPanel" />
				<ScheduleDetailPanel v-else-if="activeView === 'schedule'" :show="showDetailPanel"
					:event-id="selectedEventId" @close="closeDetailPanel" @saved="handleScheduleSaved"
					@event-deleted="selectedEventId = null" />
				<TodoDetailEditor v-else :todo-id="selectedTaskId" :show="showDetailPanel" @close="closeDetailPanel"
					@task-selected="handleTaskSelected" />
			</div>
		</div>

		<!-- 底栏：导航开关、统计与同步状态排在同一行 -->
		<footer
			class="h-8 shrink-0 border-t border-hairline bg-surface px-3 flex items-center justify-between gap-3 text-[11px] text-neutral-500 dark:border-hairline-dark dark:bg-surface-dark dark:text-neutral-400 select-none">
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
					<!-- 统计：总任务、已完成、进行中，与进度条同一行呈现 -->
					<span class="flex shrink-0 items-center gap-2.5 font-mono tabular-nums">
						<span title="总任务">
							<span class="text-neutral-400 dark:text-neutral-600">总</span>
							{{ taskStats.total }}
						</span>
						<span title="已完成" class="text-accent-700 dark:text-accent-400">
							<span class="text-neutral-400 dark:text-neutral-600">完成</span>
							{{ taskStats.completed }}
						</span>
						<span title="进行中">
							<span class="text-neutral-400 dark:text-neutral-600">进行</span>
							{{ taskStats.pending }}
						</span>
					</span>
					<span class="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700"
						:title="'已完成 ' + completionRate + '%'">
						<span class="block h-full rounded-full bg-accent-500 transition-[width] duration-300"
							:style="{ width: completionRate + '%' }"></span>
					</span>
				</template>
			</div>
			<SyncStatusIndicator :status="syncState.status" :label="syncState.label" :title="syncStatusTitle" />
		</footer>

		<!-- 设置浮窗：覆盖在当前视图之上，不打断任务操作 -->
		<Settings v-if="settingsPanelOpen" floating @close="closeSettings" />

		<!-- 操作反馈：带撤销入口的轻提示 -->
		<Transition name="fade">
			<div v-if="toast.visible"
				class="fixed bottom-24 left-1/2 z-50 flex max-w-[min(90vw,30rem)] -translate-x-1/2 items-center gap-3 panel px-3 py-2 shadow-lg">
				<span class="min-w-0 flex-1 truncate text-sm text-neutral-700 dark:text-neutral-300"
					:title="toast.message">{{ toast.message }}</span>
				<button v-if="toast.action" type="button"
					class="flex shrink-0 items-center gap-1 whitespace-nowrap text-sm font-medium text-accent-700 hover:underline dark:text-accent-400"
					@click="runToastAction">
					<AppIcon v-if="toast.action.icon" :name="toast.action.icon" :size="14" />
					{{ toast.action.label }}
				</button>
				<button v-if="toast.undo" type="button"
					class="flex shrink-0 items-center gap-1 whitespace-nowrap text-sm font-medium text-accent-700 hover:underline dark:text-accent-400"
					@click="runToastUndo">
					<AppIcon name="undo" :size="14" />
					撤销
				</button>
				<button type="button" class="shrink-0 rounded p-0.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
					title="关闭提示" @click="hideToast">
					<AppIcon name="close" :size="13" />
				</button>
			</div>
		</Transition>
	</div>
</template>
