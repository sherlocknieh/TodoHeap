<script setup>
import { computed } from 'vue'
import AppIcon from '@/components/AppIcon.vue'

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
		case 'executing': return 'loader'
		case 'complete': return 'check'
		case 'error': return 'alert'
		default: return 'clock'
	}
})

const stageLabel = computed(() => {
	switch (props.stage) {
		case 'executing': return '优化进行中'
		case 'complete': return '优化已完成'
		case 'error': return '优化出错'
		default: return '准备中'
	}
})

// 仅用文字色区分状态，避免整块彩色背景
const stageTone = computed(() => {
	switch (props.stage) {
		case 'complete': return 'text-accent-700 dark:text-accent-400'
		case 'error': return 'text-rose-600 dark:text-rose-400'
		default: return 'text-neutral-700 dark:text-neutral-300'
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
	<Transition enter-active-class="transition ease-out duration-150" enter-from-class="opacity-0"
		leave-active-class="transition ease-in duration-100" leave-to-class="opacity-0">
		<div v-if="visible" class="panel px-3 py-2.5 mt-2">
			<div class="flex items-center justify-between gap-2">
				<span class="flex items-center gap-2 min-w-0" :class="stageTone">
					<AppIcon :name="stageIcon" :size="14" :class="{ 'animate-spin': stage === 'executing' }" />
					<span class="text-sm font-medium truncate">{{ stageLabel }}</span>
				</span>
				<span v-if="stage === 'executing'" class="font-mono text-[11px] text-neutral-500">{{ elapsedSec }}s</span>
			</div>

			<!-- 已完成的操作 -->
			<ul v-if="operations.length > 0" class="mt-2 space-y-1">
				<li v-for="(op, idx) in operations" :key="idx"
					class="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-500">
					<AppIcon name="check" :size="11" class="text-accent-600 dark:text-accent-400" />
					<span>{{ op }}</span>
				</li>
			</ul>

			<!-- 当前操作 -->
			<p v-if="currentOp" class="mt-2 flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
				<span class="h-1.5 w-1.5 rounded-full bg-accent-600 dark:bg-accent-400 animate-pulse"></span>
				<span>{{ currentOp }}</span>
			</p>

			<!-- 结果摘要 -->
			<p v-if="summary && stage === 'complete'"
				class="mt-2 text-xs leading-5 text-neutral-600 dark:text-neutral-400">{{ summary }}</p>

			<!-- 变更统计 -->
			<div v-if="changesSummary && stage === 'complete'" class="mt-2 flex flex-wrap gap-1.5">
				<span v-if="changesSummary.dateAdjustedCount > 0" class="chip">
					<AppIcon name="calendar" :size="10" />{{ changesSummary.dateAdjustedCount }} 个任务已调整
				</span>
				<span v-if="changesSummary.breakdownsCount > 0" class="chip">
					<AppIcon name="list" :size="10" />{{ changesSummary.breakdownsCount }} 项拆解
				</span>
				<span v-if="changesSummary.aggregationsCount > 0" class="chip">
					<AppIcon name="link" :size="10" />{{ changesSummary.aggregationsCount }} 项聚合
				</span>
				<span v-if="changesSummary.hasRecommendation" class="chip">
					<AppIcon name="bulb" :size="10" />执行建议
				</span>
			</div>
		</div>
	</Transition>
</template>
