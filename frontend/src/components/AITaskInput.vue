<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'

const props = defineProps<{
  loading?: boolean
  progress?: {
    visible?: boolean
    stage?: string
    message?: string
    elapsedSec?: number
    createdCount?: number
  }
}>()

const taskInput = ref('')
const isComposing = ref(false)
const focused = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const emit = defineEmits<{
  submitTask: [taskText: string]
}>()

const adjustHeight = () => {
  const el = textareaRef.value
  if (el) {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }
}

const handleSubmit = () => {
  if (props.loading) return
  const trimmed = taskInput.value.trim()
  if (!trimmed) return
  
  emit('submitTask', trimmed)
  taskInput.value = ''
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto'
  }
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && e.ctrlKey) {
    e.preventDefault()
    handleSubmit()
  }
}

const handleCompositionStart = () => {
  isComposing.value = true
}

const handleCompositionEnd = () => {
  isComposing.value = false
}

const canSubmit = computed(() => !props.loading && !!taskInput.value.trim())
// 提示行只在需要时出现，空闲时保持输入区紧凑
const showHint = computed(() => props.loading || focused.value || !!taskInput.value)
</script>

<template>
  <div class="space-y-1.5">
    <div class="flex items-end gap-2">
      <div class="flex-1 min-w-0">
        <textarea
          ref="textareaRef"
          v-model="taskInput"
          class="w-full resize-none bg-transparent py-1 text-sm leading-6 outline-none placeholder:text-neutral-400 disabled:opacity-50 dark:placeholder:text-neutral-500"
          placeholder="用一句话添加，AI 自动拆成任务"
          rows="1"
          :disabled="props.loading"
          @focus="focused = true"
          @blur="focused = false"
          @keydown="handleKeydown"
          @compositionstart="handleCompositionStart"
          @compositionend="handleCompositionEnd"
          @input="adjustHeight"
        />

        <div v-if="showHint" class="flex items-center px-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
          <span class="inline-flex items-center gap-1.5">
            <span class="h-1.5 w-1.5 rounded-full"
              :class="props.loading ? 'bg-accent-600 dark:bg-accent-400' : 'bg-neutral-300 dark:bg-neutral-600'"></span>
            <span v-if="props.loading">AI 正在分析…</span>
            <span v-else-if="isComposing">正在输入</span>
            <span v-else>Ctrl + Enter 提交</span>
          </span>
        </div>
      </div>

      <button
        class="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent-700 text-white transition-colors hover:bg-accent-800 disabled:cursor-not-allowed disabled:opacity-30 dark:bg-accent-400 dark:text-accent-950 dark:hover:bg-accent-300"
        :disabled="!canSubmit"
        title="智能添加"
        @click="handleSubmit"
      >
        <AppIcon name="chevronRight" :size="15" />
      </button>
    </div>

    <!-- 分析进度 -->
    <div
      v-if="props.progress?.visible"
      class="border-t border-hairline dark:border-hairline-dark pt-2 px-1 text-xs text-neutral-600 dark:text-neutral-400"
    >
      <div class="flex items-center justify-between gap-2">
        <p class="inline-flex items-center gap-1.5 min-w-0">
          <AppIcon name="loader" :size="12" class="animate-spin" />
          <span class="truncate">{{ props.progress?.message || '处理中…' }}</span>
        </p>
        <span class="font-mono shrink-0">{{ props.progress?.elapsedSec || 0 }}s</span>
      </div>
      <div class="mt-1 flex items-center gap-3 text-[11px] text-neutral-500">
        <span>阶段 {{ props.progress?.stage || '-' }}</span>
        <span v-if="(props.progress?.createdCount || 0) > 0">已创建 {{ props.progress?.createdCount }}</span>
      </div>
    </div>
  </div>
</template>
