<script setup>
import { computed } from 'vue'
import AppIcon from '@/components/AppIcon.vue'

const props = defineProps({
  // 是否正在处理中
  isProcessing: {
    type: Boolean,
    default: false
  },
  // 状态消息
  message: {
    type: String,
    default: ''
  },
  // 状态类型: 'success' | 'error' | 'pending' | ''
  status: {
    type: String,
    default: ''
  },
  // 已生成的任务数量
  taskCount: {
    type: Number,
    default: 0
  },
  // 已生成的任务列表
  tasks: {
    type: Array,
    default: () => []
  }
})

defineEmits(['confirm', 'cancel'])

const visible = computed(() => props.isProcessing || props.message || props.status === 'pending')
</script>

<template>
  <Transition enter-active-class="transition ease-out duration-150" enter-from-class="opacity-0"
    leave-active-class="transition ease-in duration-100" leave-to-class="opacity-0">
    <div v-if="visible" class="panel px-3 py-2.5">
      <!-- 分解进行中 -->
      <div v-if="isProcessing" class="flex items-center gap-2">
        <AppIcon name="loader" :size="14" class="animate-spin text-accent-600 dark:text-accent-400" />
        <span class="text-sm font-medium text-neutral-800 dark:text-neutral-200">AI 正在分解</span>
        <span v-if="taskCount > 0" class="text-xs text-neutral-500">已生成 {{ taskCount }} 项</span>
      </div>

      <!-- 待确认 -->
      <template v-else-if="status === 'pending'">
        <div class="flex items-center gap-2">
          <AppIcon name="clock" :size="14" class="text-amber-600 dark:text-amber-500" />
          <span class="text-sm font-medium text-neutral-800 dark:text-neutral-200">已生成 {{ taskCount }} 个子任务</span>
          <span class="text-xs text-neutral-500">确认后保存</span>
        </div>
        <div class="mt-2 flex items-center gap-2">
          <button class="btn-outline text-xs px-2.5 py-1" @click="$emit('cancel')">取消</button>
          <button class="btn-primary text-xs px-2.5 py-1" @click="$emit('confirm')">保存全部</button>
        </div>
      </template>

      <!-- 成功 -->
      <div v-else-if="status === 'success'" class="flex items-center gap-2">
        <AppIcon name="check" :size="14" class="text-accent-600 dark:text-accent-400" />
        <span class="text-sm text-neutral-800 dark:text-neutral-200">{{ message }}</span>
      </div>

      <!-- 错误 -->
      <div v-else-if="status === 'error'" class="flex items-center gap-2">
        <AppIcon name="alert" :size="14" class="text-rose-600 dark:text-rose-400" />
        <span class="text-sm text-rose-600 dark:text-rose-400">{{ message }}</span>
      </div>

      <!-- 子任务预览 -->
      <TransitionGroup v-if="tasks.length > 0" tag="ul" name="task-list"
        class="mt-2 border-t border-neutral-200 dark:border-neutral-800 pt-2 space-y-1 max-h-52 overflow-auto">
        <li v-for="task in tasks" :key="task.id"
          class="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
          <AppIcon :name="isProcessing ? 'check' : 'clock'" :size="11"
            :class="isProcessing ? 'text-accent-600 dark:text-accent-400' : 'text-neutral-400'" />
          <span class="truncate">{{ task.title }}</span>
        </li>
      </TransitionGroup>
    </div>
  </Transition>
</template>

<style scoped>
/* 新生成的子任务逐条出现 */
.task-list-enter-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.task-list-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
