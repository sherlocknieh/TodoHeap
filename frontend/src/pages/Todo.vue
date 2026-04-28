<script setup>

import { ref, onMounted, computed, watch, onUnmounted, provide } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useTodoStore } from '@/stores/todos'
import { useSyncQueueStore } from '@/stores/syncQueue'
import { storeToRefs } from 'pinia'
import SyncStatusIndicator from '@/components/SyncStatusIndicator.vue'
import LeftSidebar from '@/components/LeftSidebar.vue'
import BreakdownStatusCard from '@/components/BreakdownStatusCard.vue'
import TodoDetailEditor from '@/components/TodoDetailEditor.vue'
import { TODO_DETAIL_PANEL_CONTEXT } from '@/utils/detailPanelContext'
import AITaskInput from '@/components/AITaskInput.vue'

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
		return 'list' // 默认是 ListView
	},
	set: (view) => {
		const viewNames = {
			'list': 'ListView',
			'tree': 'TreeView',
			'heap': 'HeapView',
			'trash': 'TrashView'
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
const pendingTasks = ref([]) // 待确认的任务列表（用于预览模式）
const showDetailPanel = ref(false) // 窄屏下默认不显示详情面板
const showLeftSidebar = ref(true) // 侧栏显示状态

const showViewLoading = computed(() => {
	return (activeView.value === 'tree' || activeView.value === 'heap') && todoStore.loading
})

const activeViewLabel = computed(() => {
	if (activeView.value === 'tree') return '树视图'
	if (activeView.value === 'heap') return '堆视图'
	if (activeView.value === 'trash') return '回收站'
	return '列表'
})

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

const realtimeStatusClass = computed(() => {
	const status = String(todoStore.realtimeStatus || 'UNKNOWN').toUpperCase()
	if (status === 'SUBSCRIBED') return 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
	if (status === 'CONNECTING') return 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300'
	if (status === 'RECONNECTING') return 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
	if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') return 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'
	if (status === 'CLOSED' || status === 'NO_USER') return 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300'
	return 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300'
})

const aiStatusLabel = computed(() => {
	if (isOptimizingTasks.value) return '任务优化中...'
	if (isBreakingDown.value) return '任务分解中...'
	if (isAnalyzingTask.value) return analyzeProgress.value.message || 'AI 分析中...'
	return '空闲'
})

const analyzeStageLabel = computed(() => {
	if (!isAnalyzingTask.value) return '阶段: -'
	const stage = analyzeProgress.value.stage || 'unknown'
	const sec = analyzeProgress.value.elapsedSec || 0
	return `阶段: ${stage} | ${sec}s`
})

const viewProps = computed(() => {
	return activeView.value === 'heap' ? { todos: todoStore.todos } : {}
})

const completedTodos = computed(() => {
  return (todoStore.todos || []).filter(t => (t.status === 'done'))
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
	router.push({ name: 'settings' })
	showUserMenu.value = false
}

const switchView = (view) => {
	activeView.value = view
}

const handleTaskSelected = (taskId) => {
	if (taskId === null) {
		// 取消选中任务时关闭详情面板
		// closeDetailPanel()
		selectedTaskId.value = null
	} else if (selectedTaskId.value === taskId) {
		// 如果点击的是已选中的任务，不做任何操作（保持详情面板打开）
		// 这样可以避免在编辑时误触导致面板关闭
	} else {
		// 如果选择的是新任务，更新选中ID并自动显示详情面板
		selectedTaskId.value = taskId
		showDetailPanel.value = true
	}
	console.log('选中任务ID:', taskId)
}

// 创建新任务
const createNewTask = async () => {
	try {
		const result = await todoStore.addTodo('新任务', {
			description: '',
			completed: false
		})
		if (result) {
			// 选中新创建的任务
			selectedTaskId.value = result.id
			showDetailPanel.value = true
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
			breakdownProgress.value.tasks.push(task)
		}

		const result = await todoStore.invokeBreakdown(
			todoStore.treeNodes,
			taskId,
			query,
			onTaskReceived,
			false
		)

		if (result.success) {
			// 预览模式：保存待确认的任务，显示确认界面
			pendingTasks.value = result.pendingTasks || []
			breakdownMessageType.value = 'pending'
			// 不清空进度，保持显示任务列表供用户确认
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

const handleOptimizeTasks = async () => {
	if (isOptimizingTasks.value) return

	isOptimizingTasks.value = true
	try {
		const result = await todoStore.invokeOptimizeTasks('请执行任务优化：日期调整、任务分解、任务聚合、并创建一条执行建议任务。')
		if (result.success) {
			await todoStore.fetchTodos()
			showBreakdownMessage(result.summary || '任务优化已完成', 'success')
		} else {
			showBreakdownMessage(`任务优化失败: ${result.error || '未知错误'}`, 'error')
		}
	} finally {
		isOptimizingTasks.value = false
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

// 点击外部关闭用户菜单
const handleClickOutside = (event) => {
	if (userMenuRef.value && !userMenuRef.value.contains(event.target)) {
		const userMenuButton = event.target.closest('button')
		if (!userMenuButton || !userMenuButton.textContent.includes('👤')) {
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
})
</script>


<template>
	<!-- 主界面 -->
	<div class="h-screen flex flex-col overflow-hidden">
		<!-- 主内容区 -->
		<div class="flex-1 min-w-0 min-h-0 flex overflow-hidden">
			<!-- 左侧活动栏（仿 VSCode） -->
			<aside
				class="w-14 shrink-0 bg-slate-50 dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700/70 text-slate-700 dark:text-slate-200 flex flex-col items-center justify-between py-2">
				<!-- 上方按钮 -->
				<div class="w-full flex flex-col items-center gap-1">

					<!-- 左侧栏切换按钮 -->
					<button @click="toggleLeftPanel"
						class="h-10 w-10 rounded-md flex items-center justify-center text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-white transition"
						title="切换侧栏">
						<span class="text-base">≡</span>
					</button>

					<!-- 分隔线 -->
					<div class="my-1 h-px w-8 bg-slate-300 dark:bg-slate-600"></div>
				</div>

				<!-- 下方按钮 -->
				<div class="w-full flex flex-col items-center gap-2">
					<!-- 用户头像 -->
					<div class="relative">
						<!-- 用户菜单按钮 -->
						<button @click="showUserMenu = !showUserMenu"
							class="h-9 w-9 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-100 text-xs font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors flex items-center justify-center"
							title="用户菜单">
							<span>👤</span>
						</button>
						<!-- 用户菜单内容 -->
						<Transition enter-active-class="transition ease-out duration-100"
							enter-from-class="opacity-0 scale-95" enter-to-class="opacity-100 scale-100"
							leave-active-class="transition ease-in duration-75" leave-from-class="opacity-100 scale-100"
							leave-to-class="opacity-0 scale-95">
							<div v-if="showUserMenu" ref="userMenuRef"
								class="absolute left-full bottom-0 ml-2 w-48 bg-white dark:bg-slate-900 rounded-md shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden z-50">
								<button @click="handleSignOut"
									class="w-full px-4 py-2.5 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors flex items-center gap-2 text-sm font-medium">
									<span>🚪</span>
									<span>退出登录</span>
								</button>
							</div>
						</Transition>
					</div>

					<!-- 设置按钮 -->
					<button @click="openSettings"
						class="h-9 w-9 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-100 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors flex items-center justify-center">
						<span>⚙️</span>
					</button>

				</div>
			</aside>
			<!-- 左栏：任务导航面板（统一在 LeftSidebar 内部处理移动/桌面渲染与动画） -->
			<LeftSidebar :show="showLeftSidebar" :active-view="activeView" :selected-task-id="selectedTaskId"
				:is-breaking-down="isBreakingDown" :is-optimizing="isOptimizingTasks"
				@close="() => { showLeftSidebar = false }" @switch-view="switchView" @create-task="createNewTask"
				@breakdown-task="handleBreakdownTask" @optimize-tasks="handleOptimizeTasks" />

			<!-- 中栏：主要视图内容 -->
			<div class="flex-1 flex flex-col min-w-0 min-h-0 bg-white dark:bg-slate-950" @click="onMainAreaClick">
				<!-- AI 分解状态区域 -->
				<div class="mx-auto mt-4 mb-2 max-w-4xl w-full px-4">
					<BreakdownStatusCard :is-processing="isBreakingDown" :message="breakdownMessage"
						:status="breakdownMessageType" :task-count="breakdownProgress.count"
						:tasks="breakdownProgress.tasks" @confirm="handleConfirmTasks" @cancel="handleCancelTasks" />
				</div>
				<!-- 清单内容 -->
				<div class="flex-1 min-h-0 overflow-auto bg-transparent" @click="onMainAreaClick">
					<!-- 清单内容区域 -->
					<template v-if="showViewLoading">
						<div class="flex items-center justify-center h-96 text-slate-500 dark:text-slate-400">
							<div class="text-center">
								<p class="text-lg mb-2">⏳</p>
								<p class="text-sm">加载中...</p>
							</div>
						</div>
					</template>
					<template v-else>
						<div class="mx-auto max-w-4xl w-full px-4">
							<router-view v-slot="{ Component }">
								<component :is="Component" v-bind="viewProps" :selected-task-id="selectedTaskId"
									:is-breaking-down="isBreakingDown" @task-selected="handleTaskSelected"
									@breakdown-task="handleBreakdownTask" />
							</router-view>
						</div>
					</template>
					</div>

				<!-- 已完成任务面板 -->
				<div class="mx-auto max-w-4xl w-full px-4 mb-4">
					<div class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 shadow-sm">
						<div class="flex items-center justify-between">
							<div class="font-medium text-sm">已完成 ({{ completedTodos.length }})</div>
							<button @click="showCompletedPanel = !showCompletedPanel"
								class="text-xs text-slate-500 hover:underline">
								{{ showCompletedPanel ? '收起' : '展开' }}
							</button>
						</div>
						<Transition name="fade">
							<div v-if="showCompletedPanel" class="mt-2 max-h-56 overflow-auto">
								<ul class="list-none p-0 m-0 space-y-1">
									<li v-for="t in completedTodos" :key="t.id" @click="handleTaskSelected(t.id)"
										class="flex items-center gap-2 px-3 py-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
										<label class="shrink-0 inline-flex items-center justify-center">
											<input type="checkbox" checked
												class="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
												@click.stop
												@change="toggleCompletedTodo(t)" />
										</label>
										<span class="truncate block">{{ t.title || '未命名任务' }}</span>
									</li>
								</ul>
							</div>
						</Transition>
					</div>
				</div>

				<!-- 自然语言任务输入组件 -->
				<div v-if="!isBreakingDown" class="mx-auto max-w-4xl w-full px-4 mb-4">
					<div class="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 shadow-sm transition-all duration-200 focus-within:border-indigo-300 dark:focus-within:border-indigo-600 focus-within:shadow-md dark:focus-within:shadow-indigo-900/30">
						<AITaskInput :loading="isAnalyzingTask" :progress="analyzeProgress"
							@submit-task="handleAnalyzeTaskInput" />
					</div>
				</div>

			</div>

			<!-- 右栏：详情面板 -->
			<TodoDetailEditor :todo-id="selectedTaskId" :show="showDetailPanel" @close="closeDetailPanel" />

		</div>
		<!-- 状态栏 -->
		<div
			class="h-5 shrink-0 bg-slate-100 text-slate-900 dark:bg-slate-700 dark:text-white border-t border-slate-200 dark:border-slate-600 px-3 flex items-center justify-between text-xs select-none">
			<!-- 左侧信息区 -->
			<div class="flex items-center min-w-0">
				<div
					class="lg:block ml-2 px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-sm">
					用户: {{ authStore.user?.email || '未登录' }}
				</div>
				<div
					class="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-sm font-medium">
					视图: {{ activeViewLabel }}
				</div>

				<div
					class="hidden sm:block ml-2 px-2 py-0.5 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-sm truncate">
					选中任务: {{ selectedTaskId ?? '无' }}
				</div>
				<div
					class="px-2 py-0.5 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-sm truncate max-w-[42vw] sm:max-w-none">
					AI: {{ aiStatusLabel }}
				</div>
			</div>
			<!-- 右侧信息区 -->
			<div class="flex items-center min-w-0">
				<div class="ml-2 px-2 py-0.5 rounded-sm" :class="realtimeStatusClass">
					Realtime: {{ realtimeStatusLabel }}
				</div>
				<div class="ml-2 px-2 py-0.5 rounded-sm"
					:class="hasUnsyncedChanges ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'">
					同步: {{ syncStatusLabel }}
				</div>
				<div
					class="hidden md:block ml-2 px-2 py-0.5 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-sm">
					{{ analyzeStageLabel }}
				</div>
				<button type="button" class="ml-2 px-2 py-0.5 rounded-sm transition-colors"
					:class="showDetailPanel ? 'bg-indigo-200 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' : 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-500'"
					:title="detailPanelToggleLabel" @click="toggleDetailPanel">
					详情面板: {{ showDetailPanel ? '开' : '关' }}
				</button>
			</div>
		</div>
	</div>
</template>
