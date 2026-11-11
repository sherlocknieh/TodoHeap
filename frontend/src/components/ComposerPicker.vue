<script setup>
import { computed } from 'vue'
import AppIcon from '@/components/AppIcon.vue'

// 输入区浮层选择器：+ 菜单、/ 命令、@ 上下文共用同一套列表与高亮
const props = defineProps({
  title: { type: String, default: '' },
  items: { type: Array, default: () => [] },
  activeIndex: { type: Number, default: 0 },
  emptyText: { type: String, default: '没有匹配项' },
  width: { type: String, default: 'w-72' }
})

const emit = defineEmits(['select', 'hover'])

// 分组标题只在组内第一项上方出现，避免重复
const rows = computed(() => props.items.map((item, index) => ({
  item,
  index,
  showGroup: Boolean(item.group) && item.group !== props.items[index - 1]?.group
})))
</script>

<template>
  <div class="absolute bottom-full left-0 z-20 mb-1.5 overflow-hidden rounded-lg border border-hairline bg-surface shadow-lg dark:border-hairline-dark dark:bg-surface-dark"
    :class="width">
    <p v-if="title" class="px-3 pt-2 pb-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">{{ title }}</p>
    <div class="max-h-64 overflow-y-auto pb-1">
      <template v-for="row in rows" :key="row.item.key">
        <p v-if="row.showGroup"
          class="px-3 pt-2 pb-1 text-[11px] font-medium text-neutral-400 dark:text-neutral-500">{{ row.item.group }}</p>
        <button type="button"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors"
          :class="row.index === activeIndex
            ? 'bg-accent-50 text-accent-800 dark:bg-accent-500/10 dark:text-accent-200'
            : 'text-neutral-700 dark:text-neutral-300'"
          @mouseenter="emit('hover', row.index)" @click="emit('select', row.item)">
          <AppIcon :name="row.item.icon || 'sparkles'" :size="12" class="opacity-70" />
          <span class="min-w-0 flex-1 truncate">{{ row.item.label }}</span>
          <span v-if="row.item.hint" class="shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">{{ row.item.hint }}</span>
        </button>
      </template>
      <p v-if="!items.length" class="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400">{{ emptyText }}</p>
    </div>
    <slot name="footer" />
  </div>
</template>
