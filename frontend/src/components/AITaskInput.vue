<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  loading?: boolean
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
</script>

<template>
  <div class="flex gap-2 p-3 bg-white border border-slate-200 rounded-lg shadow-sm">
    <textarea
      ref="textareaRef"
      v-model="taskInput"
      class="flex-1 min-h-10 px-3 py-2 text-sm border border-slate-300 rounded-md resize-none outline-none transition-colors duration-150 text-slate-800 placeholder:text-slate-400 focus:border-blue-500"
      placeholder="输入任务描述，按 Ctrl+Enter 提交，Enter 换行..."
      rows="1"
      :disabled="props.loading"
      @keydown="handleKeydown"
      @compositionstart="handleCompositionStart"
      @compositionend="handleCompositionEnd"
      @input="adjustHeight"
    />
    <button
      class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border-none rounded-md cursor-pointer transition-colors duration-150 whitespace-nowrap hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
      :disabled="props.loading || !taskInput.trim()"
      @click="handleSubmit"
    >
      {{ props.loading ? '分析中...' : '智能添加' }}
    </button>
  </div>
</template>