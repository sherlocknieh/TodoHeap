<script setup>
import { computed } from 'vue'

const props = defineProps({
	visible: Boolean,
	stage: String, // 'executing' | 'complete' | 'error'
	currentOp: String,
	operations: Array,
	elapsedSec: Number,
	summary: String,
	changes: Object
})

const stageIcon = computed(() => {
	switch (props.stage) {
		case 'executing': return '⚙️'
		case 'complete': return '✅'
		case 'error': return '❌'
		default: return '⏳'
	}
})

const stageLabel = computed(() => {
	switch (props.stage) {
		case 'executing': return '优化进行中...'
		case 'complete': return '优化已完成'
		case 'error': return '优化出错'
		default: return '初始化'
	}
})

const stageColor = computed(() => {
	switch (props.stage) {
		case 'executing': return 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'
		case 'complete': return 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
		case 'error': return 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800'
		default: return 'bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800'
	}
})

const stageTextColor = computed(() => {
	switch (props.stage) {
		case 'executing': return 'text-blue-700 dark:text-blue-300'
		case 'complete': return 'text-emerald-700 dark:text-emerald-300'
		case 'error': return 'text-rose-700 dark:text-rose-300'
		default: return 'text-slate-700 dark:text-slate-300'
	}
})

const changesSummary = computed(() => {
	if (!props.changes) return null
	const { dateAdjusted = [], breakdowns = [], aggregations = [], recommendationTaskId } = props.changes
	return {
		dateAdjustedCount: dateAdjusted.length,
		breakdownsCount: breakdowns.length,
		aggregationsCount: aggregations.length,
		hasRecommendation: !!recommendationTaskId
	}
})
</script>

<template>
	<Transition enter-active-class="transition ease-out duration-200"
		enter-from-class="opacity-0 translate-y-2" enter-to-class="opacity-100 translate-y-0"
		leave-active-class="transition ease-in duration-150" leave-from-class="opacity-100 translate-y-0"
		leave-to-class="opacity-0 translate-y-2">
		<div v-if="visible" :class="['rounded-lg border-2 p-4 shadow-md', stageColor]">
			<!-- 标题栏 -->
			<div class="flex items-center justify-between mb-3">
				<div class="flex items-center gap-2">
					<span class="text-2xl">{{ stageIcon }}</span>
					<span :class="['font-semibold text-lg', stageTextColor]">{{ stageLabel }}</span>
				</div>
				<div v-if="stage === 'executing'" class="text-sm text-slate-600 dark:text-slate-400">
					{{ elapsedSec }}s
				</div>
			</div>

			<!-- 操作列表 -->
			<div v-if="operations.length > 0" class="mb-3 space-y-1">
				<div v-for="(op, idx) in operations" :key="idx"
					class="text-sm text-slate-700 dark:text-slate-300 flex items-center gap-2">
					<span class="text-emerald-600 dark:text-emerald-400">{{ op }}</span>
				</div>
			</div>

			<!-- 当前操作 -->
			<div v-if="currentOp" class="mb-3 p-2 rounded bg-slate-200/50 dark:bg-slate-700/50">
				<div class="flex items-center gap-2">
					<span class="inline-block w-2 h-2 bg-current rounded-full animate-pulse"></span>
					<span class="text-sm font-medium text-slate-700 dark:text-slate-300">{{ currentOp }}</span>
				</div>
			</div>

			<!-- 摘要 -->
			<div v-if="summary && stage === 'complete'" class="mb-3 p-2 rounded bg-slate-100 dark:bg-slate-800/50">
				<p class="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{{ summary }}</p>
			</div>

			<!-- 错误消息 -->
			<div v-if="currentOp && stage === 'error'" class="mb-3 p-2 rounded bg-rose-100 dark:bg-rose-900/30">
				<p class="text-sm text-rose-700 dark:text-rose-300">{{ currentOp }}</p>
			</div>

			<!-- 变更统计 -->
			<div v-if="changesSummary && stage === 'complete'" class="flex gap-2 text-xs">
				<div v-if="changesSummary.dateAdjustedCount > 0"
					class="px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
					📅 {{ changesSummary.dateAdjustedCount }} 个任务已调整
				</div>
				<div v-if="changesSummary.breakdownsCount > 0"
					class="px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
					📋 {{ changesSummary.breakdownsCount }} 项拆解
				</div>
				<div v-if="changesSummary.aggregationsCount > 0"
					class="px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
					🔗 {{ changesSummary.aggregationsCount }} 项聚合
				</div>
				<div v-if="changesSummary.hasRecommendation"
					class="px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
					💡 已创建执行建议
				</div>
			</div>
		</div>
	</Transition>
</template>

<style scoped>
@keyframes pulse {
	0%, 100% {
		opacity: 1;
	}
	50% {
		opacity: 0.5;
	}
}

.animate-pulse {
	animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
</style>
