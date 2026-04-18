<script setup lang="ts">
import { computed, ref } from 'vue'

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

const inputLength = computed(() => taskInput.value.length)
const canSubmit = computed(() => !props.loading && !!taskInput.value.trim())
</script>

<template>
  <div class="space-y-3">
    <div>
      <div class="flex items-start gap-3">
        <div class="flex-1 space-y-2">
          <textarea
            ref="textareaRef"
            v-model="taskInput"
            class="w-full min-h-12 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition-all duration-150 focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 disabled:bg-slate-100 dark:disabled:bg-slate-800"
            placeholder="输入任务描述，按 Ctrl+Enter 提交，Enter 换行..."
            rows="1"
            :disabled="props.loading"
            @keydown="handleKeydown"
            @compositionstart="handleCompositionStart"
            @compositionend="handleCompositionEnd"
            @input="adjustHeight"
          />

          <div class="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
            <div class="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <span class="inline-flex h-2 w-2 rounded-full" :class="props.loading ? 'bg-indigo-500 dark:bg-indigo-400 animate-pulse' : 'bg-emerald-500 dark:bg-emerald-400'"></span>
              <span v-if="props.loading">AI 正在分析，请稍候...</span>
              <span v-else-if="isComposing">正在输入（中文输入法）</span>
              <span v-else>提示：Ctrl+Enter 快速提交</span>
            </div>
            <span class="font-medium text-slate-400 dark:text-slate-600">{{ inputLength }} 字</span>
          </div>
        </div>

        <button
          class="shrink-0 rounded-lg bg-indigo-600 dark:bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-indigo-700 dark:hover:bg-indigo-600 hover:shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-slate-700"
          :disabled="!canSubmit"
          @click="handleSubmit"
        >
          {{ props.loading ? '分析中...' : '智能添加' }}
        </button>
      </div>
    </div>

    <div
      v-if="props.progress?.visible"
      class="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-2 text-xs text-indigo-900 dark:text-indigo-200"
    >
      <div class="flex items-center justify-between gap-2">
        <p class="font-semibold">
          边缘函数进度: {{ props.progress?.message || '处理中...' }}
        </p>
        <span class="rounded-full bg-indigo-100 dark:bg-indigo-800/50 px-2 py-0.5 text-indigo-700 dark:text-indigo-300">
          已运行 {{ props.progress?.elapsedSec || 0 }}s
        </span>
      </div>
      <div class="mt-1.5 flex items-center gap-3 text-indigo-700 dark:text-indigo-300">
        <span class="rounded-md bg-indigo-100 dark:bg-indigo-800/50 px-2 py-0.5">阶段: {{ props.progress?.stage || '-' }}</span>
        <span v-if="(props.progress?.createdCount || 0) > 0">
          已创建: {{ props.progress?.createdCount }}
        </span>
      </div>
    </div>
  </div>
</template>