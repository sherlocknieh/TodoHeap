<template>
	<!-- 图视图：思维导图占满活动栏以外的区域 -->
	<div class="w-full h-full overflow-hidden">
		<MindMapWrapper :nodes="mindMapNodes" :selected-task-id="props.selectedTaskId"
			@task-selected="id => emit('task-selected', id)" />
	</div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useTodoStore } from '@/stores/todos'
import MindMapWrapper from '@/components/MindMapWrapper.vue'

const props = defineProps({
	selectedTaskId: { type: Number, default: null }
})

const emit = defineEmits(['task-selected'])

const todoStore = useTodoStore()

onMounted(async () => {
	if (!todoStore.isFetched) {
		await todoStore.fetchTodos()
	}
})

// 回边节点只是引用，点击时回到被引用的真实任务
const mapNode = (todo) => ({
	id: String(todo.id),
	title: todo._isRef ? `\u21A9\uFE0E ${todo.title || '未命名任务'}` : (todo.title || '未命名任务'),
	completed_at: todo.completed_at || null,
	isRef: !!todo._isRef,
	targetId: todo._isRef ? todo._refTargetId : todo.id,
	children: (todo.children || []).map(mapNode)
})

// 复用 store 中已排序并展开回边的森林，外层补一个总根节点
const mindMapNodes = computed(() => [{
	id: 'root',
	title: '全部任务',
	isRoot: true,
	children: (todoStore.treeNodes || []).map(mapNode)
}])
</script>
