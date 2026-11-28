<template>
  <!-- [右侧栏分区标题]：chevron + eyebrow + 计数，点击整行折叠/展开 -->
  <div data-section-header class="shrink-0 flex items-center gap-1 pl-2 pr-4"
    :class="first ? 'pt-0' : 'border-t border-hairline pt-2 dark:border-hairline-dark'">
    <button type="button"
      class="flex-1 flex items-center gap-1 py-1 rounded text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
      :aria-expanded="!collapsed" @click="emit('toggle')">
      <AppIcon :name="collapsed ? 'chevronRight' : 'chevronDown'" :size="12" class="opacity-70" />
      <span class="eyebrow">{{ title }}</span>
      <span v-if="count !== null && count !== undefined"
        class="ml-auto shrink-0 font-mono text-[10px] text-neutral-400 dark:text-neutral-500">{{ count }}</span>
    </button>
    <slot name="actions" />
  </div>
</template>

<script setup>
import AppIcon from '@/components/AppIcon.vue'

// 右侧栏分区栈的共用标题行；折叠状态与高度由 useSectionStack 维护
defineProps({
  title: { type: String, required: true },
  collapsed: { type: Boolean, default: false },
  count: { type: [Number, String], default: null },
  first: { type: Boolean, default: false }
})

const emit = defineEmits(['toggle'])
</script>
