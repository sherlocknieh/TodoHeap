<script setup>

import { ref, onMounted, computed, watch, onUnmounted, provide } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useTodoStore } from '@/stores/todos'
import { useSyncQueueStore } from '@/stores/syncQueue'
import { storeToRefs } from 'pinia'
import LeftSidebar from '@/components/LeftSidebar.vue'
import AppIcon from '@/components/AppIcon.vue'
import TodoDetailEditor from '@/components/TodoDetailEditor.vue'
import { TODO_DETAIL_PANEL_CONTEXT } from '@/utils/detailPanelContext'
import Settings from '@/pages/todo/Settings.vue'
import { settingsPanelOpen } from '@/utils/settingsPanel'

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
		if (routeName === 'TreeView') return 'tree'
		if (routeName === 'HeapView') return 'heap'
		if (routeName === 'TrashView') return 'trash'
		if (routeName === 'AIView') return 'ai'
		if (routeName === 'ScheduleView') return 'schedule'
		return 'list' // 默认是 ListView
	},
	set: (view) => {
		const viewNames = {
			'list': 'ListView',
			'tree': 'TreeView',
			'heap': 'HeapView',
			'trash': 'TrashView',
			'ai': 'AIView',
			'schedule': 'ScheduleView'
		}
		router.push({ name: viewNames[view] })
	}
})

const showUserMenu = ref(false)
const selectedTaskId = ref(null)
const showDetailPanel = ref(false) // 窄屏下默认不显示详情面板
// 侧栏显示状态：窄屏默认收起，避免浮层遮住清单
const showLeftSidebar = ref(window.innerWidth >= 1024)
const windowWidth = ref(window.innerWidth)

const showViewLoading = computed(() => {
	return (activeView.value === 'tree' || activeView.value === 'heap') && todoStore.loading
})

const activeViewLabel = computed(() => {
	if (activeView.value === 'tree') return '树视图'
	if (activeView.value === 'heap') return '堆视图'
	if (activeView.value === 'trash') return '回收站'
	if (activeView.value === 'ai') return 'AI'
	if (activeView.value === 'schedule') return '日程'
	return '列表'
})

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

// 点击当前入口切换侧栏，点击其他入口切换视图并展开对应侧栏
const openNavEntry = (entry) => {
	if (activeSection.value === entry.id) {
		showLeftSidebar.value = !showLeftSidebar.value
		return
	}
	switchView(entry.id)
	showLeftSidebar.value = true
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
	return status
})

// 实时连接状态映射为状态点颜色
const realtimeStatusClass = computed(() => {
	const status = String(todoStore.realtimeStatus || 'UNKNOWN').toUpperCase()
	if (status === 'SUBSCRIBED') return 'bg-emerald-600 dark:bg-emerald-400'
	if (status === 'CONNECTING' || status === 'RECONNECTING') return 'bg-amber-500'
	if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') return 'bg-rose-500'
	return 'bg-neutral-300 dark:bg-neutral-600'
})

const viewProps = computed(() => {
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

const detailPanelToggleLabel = computed(() => showDetailPanel.value ? '隐藏详情面板' : '显示详情面板')

provide(TODO_DETAIL_PANEL_CONTEXT, {
	openDetailPanel
})

// 页面离开警告处理
// 跨过桌面/窄屏阈值时自动切换侧栏，窄屏不遮住清单
let lastWindowWidth = typeof window === 'undefined' ? 1024 : window.innerWidth
const handleWindowResize = () => {
	const width = window.innerWidth
	windowWidth.value = width
	if (width < 1024 && lastWindowWidth >= 1024) showLeftSidebar.value = false
	if (width >= 1024 && lastWindowWidth < 1024) showLeftSidebar.value = true
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
})

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

// 浮层侧栏：窄屏抽屉或树视图覆盖模式，点击外部应自动收起
const isSidebarFloating = computed(() => activeView.value === 'tree' || windowWidth.value < 1024)

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
}

const toggleLeftPanel = () => {
	showLeftSidebar.value = !showLeftSidebar.value
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
			<!-- 左侧活动栏 -->
			<aside data-activity-rail
				class="w-12 shrink-0 bg-accent-700 dark:bg-accent-900 flex flex-col items-center justify-between py-2">
				<div class="flex flex-col items-center gap-1">
					<!-- 侧栏开关 -->
					<button @click="toggleLeftPanel"
						class="h-9 w-9 rounded-md flex items-center justify-center text-white/80 hover:bg-white/15 hover:text-white transition-colors"
						title="切换侧栏">
						<AppIcon name="sidebar" />
					</button>

					<!-- 主入口 -->
					<nav class="flex flex-col items-center gap-1 pt-1 border-t border-white/20 w-8">
						<button v-for="entry in navEntries" :key="entry.id" @click="openNavEntry(entry)"
							:title="entry.label"
							:class="[
								'h-9 w-9 rounded-md flex items-center justify-center transition-colors',
								isNavEntryActive(entry.id)
									? 'bg-white/20 text-white'
									: 'text-white/70 hover:bg-white/15 hover:text-white'
							]">
							<span v-if="entry.id === 'ai'" class="text-[11px] font-semibold tracking-tight">AI</span>
							<AppIcon v-else :name="entry.icon" />
						</button>
					</nav>
				</div>

				<!-- 账户与设置 -->
				<div class="flex flex-col items-center gap-1">
					<div class="relative">
						<button data-user-menu-trigger @click="showUserMenu = !showUserMenu"
							class="h-9 w-9 rounded-md flex items-center justify-center text-white/80 hover:bg-white/15 hover:text-white transition-colors"
							title="用户菜单">
							<AppIcon name="user" />
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
						class="h-9 w-9 rounded-md flex items-center justify-center text-white/80 hover:bg-white/15 hover:text-white transition-colors"
						title="设置">
						<AppIcon name="sliders" />
					</button>
				</div>
			</aside>

			<!-- 左栏：任务导航面板；树视图下覆盖在导图之上，避免改变导图宽度 -->
			<LeftSidebar :show="showLeftSidebar" :active-view="activeView" :selected-task-id="selectedTaskId"
				:section="activeSection"
				:overlay="activeView === 'tree'"
				@close="() => { showLeftSidebar = false }" @switch-view="switchView" @create-task="createNewTask"
				/>

			<!-- 中栏：主要视图内容 -->
			<div class="flex-1 flex flex-col min-w-0 min-h-0">
				<!-- 清单内容 -->
				<div class="flex-1 min-h-0" :class="['tree', 'ai'].includes(activeView) ? 'overflow-hidden' : 'overflow-auto'"
					@click="onMainAreaClick">
					<div v-if="showViewLoading" class="flex items-center justify-center h-96 meta-text">
						<span class="inline-flex items-center gap-2">
							<AppIcon name="loader" class="animate-spin" />
							加载视图…
						</span>
					</div>
					<template v-else>
						<div :class="activeView === 'tree'
							? 'h-full'
							: activeView === 'ai'
								? 'mx-auto max-w-3xl w-full px-6 pb-4 h-full flex flex-col min-h-0'
								: activeView === 'trash'
									? 'mx-auto flex h-full max-w-3xl w-full flex-col px-8 pt-6 pb-6'
									: 'mx-auto max-w-3xl w-full px-8 pb-6'">
							<router-view v-slot="{ Component }">
								<component :is="Component" v-bind="viewProps" :selected-task-id="selectedTaskId"
									@task-selected="handleTaskSelected"
									@notify="handleNotify" @open-sidebar="showLeftSidebar = true" />
							</router-view>
						</div>
					</template>
				</div>
			</div>

			<!-- 右栏：详情面板 -->
			<TodoDetailEditor :todo-id="selectedTaskId" :show="showDetailPanel" @close="closeDetailPanel"
				@task-selected="handleTaskSelected" />
		</div>

		<!-- 状态栏：树视图全屏展示思维导图时隐藏 -->
		<footer v-if="activeView !== 'tree'"
			class="h-7 shrink-0 border-t border-hairline dark:border-hairline-dark px-3 flex items-center justify-between gap-3 text-[11px] text-neutral-500 dark:text-neutral-500 select-none">
			<div class="flex items-center gap-3 min-w-0">
				<span class="truncate">{{ authStore.user?.email || '未登录' }}</span>
				<span class="text-neutral-300 dark:text-neutral-700">·</span>
				<span class="shrink-0">{{ activeViewLabel }}</span>
			</div>
			<div class="flex items-center gap-3 shrink-0">
				<span class="flex items-center gap-1.5" :title="'实时连接：' + realtimeStatusLabel">
					<span class="h-1.5 w-1.5 rounded-full" :class="realtimeStatusClass"></span>
					<span class="hidden md:inline">{{ realtimeStatusLabel }}</span>
				</span>
				<span class="flex items-center gap-1.5">
					<span class="h-1.5 w-1.5 rounded-full"
						:class="hasUnsyncedChanges ? 'bg-amber-500' : 'bg-emerald-600 dark:bg-emerald-400'"></span>
					{{ syncStatusLabel }}
				</span>
				<button type="button" class="p-1 rounded hover:bg-accent-50 dark:hover:bg-accent-500/10 transition-colors"
					:title="detailPanelToggleLabel" @click="toggleDetailPanel">
					<AppIcon name="panelRight" :size="14" />
				</button>
			</div>
		</footer>

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
