<script setup>

import { ref, onMounted, computed, watch, onUnmounted, provide } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useTodoStore } from '@/stores/todos'
import { useSyncQueueStore } from '@/stores/syncQueue'
import { storeToRefs } from 'pinia'
import LeftSidebar from '@/components/LeftSidebar.vue'
import AppIcon from '@/components/AppIcon.vue'
import BreakdownStatusCard from '@/components/BreakdownStatusCard.vue'
import OptimizeProgressCard from '@/components/OptimizeProgressCard.vue'
import TodoDetailEditor from '@/components/TodoDetailEditor.vue'
import { TODO_DETAIL_PANEL_CONTEXT } from '@/utils/detailPanelContext'
import AITaskInput from '@/components/AITaskInput.vue'
import Settings from '@/pages/todo/Settings.vue'
import { DEFAULT_USER_SETTINGS, fetchUserSettings } from '@/lib/userSettings'
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
const isBreakingDown = ref(false)
const showCompletedPanel = ref(true)
const isAnalyzingTask = ref(false)
const isOptimizingTasks = ref(false)
const analyzeProgress = ref({
	visible: false,
	stage: '',
	message: '',
	elapsedSec: 0,
	createdCount: 0
})
const breakdownMessage = ref('')
const breakdownMessageType = ref('') // 'success' or 'error'
const breakdownProgress = ref({ count: 0, tasks: [] }) // 分解进度
const optimizeProgress = ref({
	visible: false,
	stage: '', // 'executing' | 'complete' | 'error'
	currentOp: '', // 当前操作描述
	operations: [], // 已完成的操作列表
	elapsedSec: 0,
	summary: '',
	changes: null
}) // 优化进度
const pendingTasks = ref([]) // 待确认的任务列表（用于预览模式）
const userSettings = ref({ ...DEFAULT_USER_SETTINGS })
const showDetailPanel = ref(false) // 窄屏下默认不显示详情面板
const showLeftSidebar = ref(true) // 侧栏显示状态

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

// 活动栏主入口：清单、日程与 AI 分别对应视图
const navEntries = [
	{ id: 'list', label: '清单', icon: 'list' },
	{ id: 'schedule', label: '日程', icon: 'calendar' },
	{ id: 'ai', label: 'AI' }
]

const isNavEntryActive = (id) => {
	if (id === 'ai') return activeView.value === 'ai'
	if (id === 'schedule') return activeView.value === 'schedule'
	return activeView.value !== 'ai' && activeView.value !== 'schedule'
}

const openNavEntry = (entry) => {
	switchView(entry.id)
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

const aiStatusLabel = computed(() => {
	if (isOptimizingTasks.value) return '任务优化中...'
	if (isBreakingDown.value) return '任务分解中...'
	if (isAnalyzingTask.value) return analyzeProgress.value.message || 'AI 分析中...'
	return '空闲'
})

const viewProps = computed(() => {
	if (activeView.value === 'heap') return { todos: todoStore.todos }
	// AI 视图自行承载输入与优化入口
	if (activeView.value === 'ai') {
		return {
			loading: isAnalyzingTask.value,
			progress: analyzeProgress.value,
			isOptimizing: isOptimizingTasks.value
		}
	}
	return {}
})

const completedTodos = computed(() => {
  return (todoStore.todos || []).filter(t => t.completed_at)
})

const toggleCompletedTodo = async (todo) => {
	if (!todo?.id) return
	await todoStore.toggleDone(todo.id)
}

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

	// 如果已登录，获取待办事项
	if (authStore.isAuthenticated) {
		await todoStore.fetchTodos()
		const settingsResult = await fetchUserSettings(authStore.user?.id)
		if (settingsResult.success) {
			userSettings.value = { ...settingsResult.data }
		}
		// 初始化 Realtime 订阅
		todoStore.setupRealtimeSubscription()
	}
	// 添加事件监听器
	document.addEventListener('click', handleClickOutside)
	window.addEventListener('beforeunload', handleBeforeUnload)
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

const handleBreakdownTask = async (taskId) => {
	if (!taskId) {
		showBreakdownMessage('请先选择一个任务', 'error')
		return
	}

	isBreakingDown.value = true
	breakdownMessage.value = ''
	breakdownMessageType.value = ''
	breakdownProgress.value = { count: 0, tasks: [] }
	pendingTasks.value = []

	try {
		const query = '继续分解'

		// 使用流式接收，每收到一个子任务就更新进度
		const onTaskReceived = ({ task, index, totalSoFar }) => {
			breakdownProgress.value.count = totalSoFar
			breakdownProgress.value.tasks = [...breakdownProgress.value.tasks, task].sort((a, b) => {
				const aOrder = Number.isFinite(a.sort_order) ? a.sort_order : Number.POSITIVE_INFINITY
				const bOrder = Number.isFinite(b.sort_order) ? b.sort_order : Number.POSITIVE_INFINITY
				if (aOrder !== bOrder) return aOrder - bOrder
				const aIndex = Number.isFinite(a.index) ? a.index : Number.POSITIVE_INFINITY
				const bIndex = Number.isFinite(b.index) ? b.index : Number.POSITIVE_INFINITY
				if (aIndex !== bIndex) return aIndex - bIndex
				return String(a.title || '').localeCompare(String(b.title || ''))
			})
		}

		const result = await todoStore.invokeBreakdown(
			todoStore.treeNodes,
			taskId,
			query,
			onTaskReceived,
			Boolean(userSettings.value.autoApplyAITasks)
		)

		if (result.success) {
			if (userSettings.value.autoApplyAITasks) {
				showBreakdownMessage(`成功添加 ${result.addedCount || 0} 个子任务`, 'success')
				pendingTasks.value = []
				breakdownProgress.value = { count: 0, tasks: [] }
			} else {
				// 预览模式：保存待确认的任务，显示确认界面
				pendingTasks.value = result.pendingTasks || []
				breakdownMessageType.value = 'pending'
				// 不清空进度，保持显示任务列表供用户确认
			}
		} else {
			showBreakdownMessage(`任务分解失败: ${result.error}`, 'error')
		}
	} finally {
		isBreakingDown.value = false
	}
}

const handleAnalyzeTaskInput = async (taskText) => {
	if (!taskText || isAnalyzingTask.value) return

	isAnalyzingTask.value = true
	analyzeProgress.value.visible = true
	analyzeProgress.value.stage = 'prepare'
	analyzeProgress.value.message = '准备分析任务...'
	analyzeProgress.value.elapsedSec = 0
	analyzeProgress.value.createdCount = 0
	startAnalyzeTimer()
	try {
		const result = await todoStore.invokeAnalyzeAndCreate(taskText, null, (progress) => {
			analyzeProgress.value.stage = progress?.stage || ''
			analyzeProgress.value.message = progress?.message || ''
			if (typeof progress?.createdCount === 'number') {
				analyzeProgress.value.createdCount = progress.createdCount
			}
		})
		if (result.success) {
			await todoStore.fetchTodos()
			showBreakdownMessage(`已创建 ${result.createdCount} 个任务`, 'success')
		} else {
			showBreakdownMessage(`任务分析失败: ${result.error || '未知错误'}`, 'error')
		}
	} finally {
		stopAnalyzeTimer()
		isAnalyzingTask.value = false
		setTimeout(() => {
			resetAnalyzeProgress()
		}, 1200)
	}
}

// 确认保存待确认的任务
const handleConfirmTasks = async () => {
	if (pendingTasks.value.length === 0) return

	const result = await todoStore.applyPendingTasks(pendingTasks.value)

	if (result.success) {
		showBreakdownMessage(`成功添加 ${result.addedCount} 个子任务`, 'success')
	} else {
		showBreakdownMessage('保存任务失败', 'error')
	}

	// 清空状态
	pendingTasks.value = []
	breakdownProgress.value = { count: 0, tasks: [] }
}

// 取消待确认的任务
const handleCancelTasks = () => {
	pendingTasks.value = []
	breakdownProgress.value = { count: 0, tasks: [] }
	breakdownMessage.value = ''
	breakdownMessageType.value = ''
}

const showBreakdownMessage = (message, type) => {
	breakdownMessage.value = message
	breakdownMessageType.value = type
	// 3秒后自动清除消息
	setTimeout(() => {
		breakdownMessage.value = ''
		breakdownMessageType.value = ''
	}, 3000)
}

let analyzeTimer = null

const resetAnalyzeProgress = () => {
	analyzeProgress.value = {
		visible: false,
		stage: '',
		message: '',
		elapsedSec: 0,
		createdCount: 0
	}
}

const startAnalyzeTimer = () => {
	if (analyzeTimer) {
		clearInterval(analyzeTimer)
	}
	analyzeTimer = setInterval(() => {
		analyzeProgress.value.elapsedSec += 1

		if (analyzeProgress.value.stage === 'prepare' && analyzeProgress.value.elapsedSec >= 6) {
			analyzeProgress.value.message = '正在初始化会话与请求参数...'
		}

		if (analyzeProgress.value.stage === 'request' && analyzeProgress.value.elapsedSec >= 20) {
			analyzeProgress.value.message = '边缘函数执行中，正在等待返回...'
		}
	}, 1000)
}

const stopAnalyzeTimer = () => {
	if (!analyzeTimer) return
	clearInterval(analyzeTimer)
	analyzeTimer = null
}

let optimizeTimer = null

const resetOptimizeProgress = () => {
	optimizeProgress.value = {
		visible: false,
		stage: '',
		currentOp: '',
		operations: [],
		elapsedSec: 0,
		summary: '',
		changes: null
	}
}

const startOptimizeTimer = () => {
	if (optimizeTimer) clearInterval(optimizeTimer)
	optimizeTimer = setInterval(() => {
		optimizeProgress.value.elapsedSec += 1
	}, 1000)
}

const stopOptimizeTimer = () => {
	if (!optimizeTimer) return
	clearInterval(optimizeTimer)
	optimizeTimer = null
}

const handleOptimizeTasks = async () => {
	if (isOptimizingTasks.value) return

	isOptimizingTasks.value = true
	resetOptimizeProgress()
	optimizeProgress.value.visible = true
	optimizeProgress.value.stage = 'executing'
	optimizeProgress.value.currentOp = '初始化优化任务...'
	startOptimizeTimer()

	try {
		// 显示初始的操作提示
		optimizeProgress.value.operations.push('正在分析任务树结构')
		optimizeProgress.value.currentOp = '正在执行优化操作...'
		await new Promise(resolve => setTimeout(resolve, 500))

		const result = await todoStore.invokeOptimizeTasks('请执行任务优化：日期调整、任务聚合、并创建一条执行建议任务。')
		
		stopOptimizeTimer()

		if (result.success) {
			optimizeProgress.value.operations.push('日期调整完成')
			optimizeProgress.value.operations.push('任务聚合完成')
			optimizeProgress.value.operations.push('执行建议已创建')
			optimizeProgress.value.currentOp = '优化完成，正在加载更新...'
			
			await todoStore.fetchTodos()
			
			optimizeProgress.value.stage = 'complete'
			optimizeProgress.value.summary = result.summary || '任务优化已完成'
			optimizeProgress.value.changes = result.changes || {}
			optimizeProgress.value.currentOp = ''
			
			showBreakdownMessage(result.summary || '任务优化已完成', 'success')
			
			// 3秒后隐藏进度窗口
			setTimeout(() => {
				optimizeProgress.value.visible = false
			}, 3000)
		} else {
			optimizeProgress.value.stage = 'error'
			optimizeProgress.value.currentOp = `错误: ${result.error || '未知错误'}`
			showBreakdownMessage(`任务优化失败: ${result.error || '未知错误'}`, 'error')
			
			setTimeout(() => {
				optimizeProgress.value.visible = false
			}, 3000)
		}
	} catch (error) {
		stopOptimizeTimer()
		optimizeProgress.value.stage = 'error'
		optimizeProgress.value.currentOp = `异常: ${error.message || '未知错误'}`
		showBreakdownMessage(`任务优化异常: ${error.message || '未知错误'}`, 'error')
		setTimeout(() => {
			optimizeProgress.value.visible = false
		}, 3000)
	} finally {
		isOptimizingTasks.value = false
		stopOptimizeTimer()
	}
}

// 点击外部关闭用户菜单
const handleClickOutside = (event) => {
	if (userMenuRef.value && !userMenuRef.value.contains(event.target)) {
		if (!event.target.closest('[data-user-menu-trigger]')) {
			showUserMenu.value = false
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
	stopAnalyzeTimer()
	document.removeEventListener('click', handleClickOutside)
	// 清理 Realtime 订阅
	todoStore.cleanupRealtimeSubscription()
	// 移除页面离开警告
	window.removeEventListener('beforeunload', handleBeforeUnload)
	window.removeEventListener('sync:id-replaced', handleSelectedIdReplaced)
	// 离开应用页时收起设置浮窗，避免下次进入时残留
	settingsPanelOpen.value = false
})
</script>


<template>
	<!-- 主界面 -->
	<div class="h-screen flex flex-col overflow-hidden">
		<!-- 主内容区 -->
		<div class="flex-1 min-w-0 min-h-0 flex overflow-hidden">
			<!-- 左侧活动栏 -->
			<aside
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

			<!-- 左栏：任务导航面板 -->
			<LeftSidebar :show="showLeftSidebar" :active-view="activeView" :selected-task-id="selectedTaskId"
				:is-breaking-down="isBreakingDown"
				@close="() => { showLeftSidebar = false }" @switch-view="switchView" @create-task="createNewTask"
				@breakdown-task="handleBreakdownTask" />

			<!-- 中栏：主要视图内容 -->
			<div class="flex-1 flex flex-col min-w-0 min-h-0">
				<!-- AI 分解与优化状态 -->
				<div class="mx-auto mt-4 mb-3 max-w-3xl w-full px-6">
					<BreakdownStatusCard :is-processing="isBreakingDown" :message="breakdownMessage"
						:status="breakdownMessageType" :task-count="breakdownProgress.count"
						:tasks="breakdownProgress.tasks" @confirm="handleConfirmTasks" @cancel="handleCancelTasks" />
					<OptimizeProgressCard :visible="optimizeProgress.visible" :stage="optimizeProgress.stage"
						:current-op="optimizeProgress.currentOp" :operations="optimizeProgress.operations"
						:elapsed-sec="optimizeProgress.elapsedSec" :summary="optimizeProgress.summary"
						:changes="optimizeProgress.changes" />
				</div>

				<!-- 清单内容 -->
				<div class="flex-1 min-h-0 overflow-auto" @click="onMainAreaClick">
					<div v-if="showViewLoading" class="flex items-center justify-center h-96 meta-text">
						<span class="inline-flex items-center gap-2">
							<AppIcon name="loader" class="animate-spin" />
							加载视图…
						</span>
					</div>
					<template v-else>
						<div class="mx-auto max-w-3xl w-full px-6 pb-4 space-y-3"
							:class="activeView === 'ai' ? 'min-h-full flex flex-col justify-center' : ''">
							<router-view v-slot="{ Component }">
								<component :is="Component" v-bind="viewProps" :selected-task-id="selectedTaskId"
									:is-breaking-down="isBreakingDown"
									@task-selected="handleTaskSelected" @breakdown-task="handleBreakdownTask"
									@submit-task="handleAnalyzeTaskInput" @optimize-tasks="handleOptimizeTasks" />
							</router-view>

							<!-- 已完成任务：收在清单下方，与列表同宽同卡 -->
							<section v-if="activeView !== 'ai' && activeView !== 'schedule'" class="panel px-4 py-3">
								<div class="flex items-center justify-between">
									<span class="text-[11px] font-semibold tracking-[0.1em] text-neutral-500 dark:text-neutral-400">
										已完成 <span class="ml-1 font-mono text-neutral-900 dark:text-neutral-100">{{ completedTodos.length }}</span>
									</span>
									<button @click="showCompletedPanel = !showCompletedPanel"
										class="text-xs font-medium text-accent-700 hover:underline dark:text-accent-400 transition-colors">
										{{ showCompletedPanel ? '收起' : '展开' }}
									</button>
								</div>
								<Transition name="fade">
									<div v-if="showCompletedPanel" class="mt-2 max-h-52 overflow-auto">
										<ul class="space-y-px">
											<li v-for="t in completedTodos" :key="t.id" @click="handleTaskSelected(t.id)"
												:class="[
													'flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm cursor-pointer transition-colors',
													selectedTaskId === t.id
														? 'bg-accent-50 text-accent-900 dark:bg-accent-500/10 dark:text-accent-100'
														: 'text-neutral-600 dark:text-neutral-400 hover:bg-accent-50/70 dark:hover:bg-accent-500/[0.06]'
												]">
												<input type="checkbox" checked
													class="h-3.5 w-3.5 rounded border-accent-300 accent-accent-600 dark:accent-accent-400"
													@click.stop @change="toggleCompletedTodo(t)" />
												<span class="truncate">{{ t.title || '未命名任务' }}</span>
											</li>
										</ul>
									</div>
								</Transition>
							</section>
						</div>
					</template>
				</div>

				<!-- 自然语言任务输入：AI 视图自带输入框，避免重复 -->
				<div v-if="!isBreakingDown && activeView !== 'ai'" class="mx-auto max-w-3xl w-full px-6 pb-4">
					<div class="panel p-2">
						<AITaskInput :loading="isAnalyzingTask" :progress="analyzeProgress"
							@submit-task="handleAnalyzeTaskInput" />
					</div>
				</div>
			</div>

			<!-- 右栏：详情面板 -->
			<TodoDetailEditor :todo-id="selectedTaskId" :show="showDetailPanel" @close="closeDetailPanel" />
		</div>

		<!-- 状态栏 -->
		<footer
			class="h-7 shrink-0 border-t border-hairline dark:border-hairline-dark px-3 flex items-center justify-between gap-3 text-[11px] text-neutral-500 dark:text-neutral-500 select-none">
			<div class="flex items-center gap-3 min-w-0">
				<span class="truncate">{{ authStore.user?.email || '未登录' }}</span>
				<span class="text-neutral-300 dark:text-neutral-700">·</span>
				<span class="shrink-0">{{ activeViewLabel }}</span>
				<span class="hidden sm:inline text-neutral-300 dark:text-neutral-700">·</span>
				<span class="hidden sm:inline truncate">{{ aiStatusLabel }}</span>
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
	</div>
</template>
