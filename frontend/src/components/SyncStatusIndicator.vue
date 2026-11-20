<script setup>
import { computed } from 'vue'

// 同步状态徽章：底栏与日程右栏共用，只负责把状态映射成圆点与文案
const props = defineProps({
  status: { type: String, default: 'idle' }, // idle | saving | pending | error | offline
  label: { type: String, default: '' },
  title: { type: String, default: '' }
})

const PRESETS = {
  idle: { label: '已同步', dot: 'bg-emerald-600 dark:bg-emerald-400', text: 'text-neutral-500 dark:text-neutral-400' },
  saving: { label: '同步中', dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  pending: { label: '待同步', dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  error: { label: '同步失败', dot: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400' },
  offline: { label: '未连接', dot: 'bg-neutral-300 dark:bg-neutral-600', text: 'text-neutral-500 dark:text-neutral-400' }
}

const preset = computed(() => PRESETS[props.status] || PRESETS.idle)
const text = computed(() => props.label || preset.value.label)
</script>

<template>
  <span class="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1" :class="preset.text" :title="title">
    <span class="h-1.5 w-1.5 rounded-full" :class="preset.dot"></span>
    {{ text }}
  </span>
</template>
