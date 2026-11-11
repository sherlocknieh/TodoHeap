<script setup>
import { computed, ref, watch } from 'vue'
import { useScheduleStore } from '@/stores/schedules'
import { toDateTimeLocalValue } from '@/utils/deadline'
import { useResizablePanel } from '@/utils/resizablePanel'
import AppIcon from '@/components/AppIcon.vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  eventId: { type: [Number, String], default: null }
})

const emit = defineEmits(['close', 'event-deleted'])

const scheduleStore = useScheduleStore()

// 与任务详情面板同款拖拽调宽，宽度独立保存
const { width: panelWidth, resizing: panelResizing, collapseArmed: panelCollapseArmed, start: startResize } = useResizablePanel({
  key: 'schedule-detail-width',
  initial: 320,
  min: 260,
  side: 'right',
  onCollapse: () => emit('close')
})

const event = computed(() => {
  if (props.eventId == null) return null
  return scheduleStore.schedules.find(item => String(item.id) === String(props.eventId)) || null
})

const form = ref({ title: '', notes: '', start_at: '', end_at: '' })
const errorMessage = ref('')
const isSaving = ref(false)

// 切换选中日程时重置草稿，未保存的编辑不会带到另一条日程
const resetForm = (item) => {
  errorMessage.value = ''
  isSaving.value = false
  form.value = item
    ? {
      title: item.title || '',
      notes: item.notes || '',
      start_at: toDateTimeLocalValue(item.start_at),
      end_at: toDateTimeLocalValue(item.end_at)
    }
    : { title: '', notes: '', start_at: '', end_at: '' }
}

// 选中日程或数据到达时重置草稿；保存后的回写不打断正在编辑的内容
watch(() => [props.eventId, event.value?.id], () => resetForm(event.value), { immediate: true })

const startLabel = computed(() => {
  if (!event.value) return ''
  const date = new Date(event.value.start_at)
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
})

const save = async () => {
  if (!event.value || isSaving.value) return

  const title = form.value.title.trim()
  const start = new Date(form.value.start_at)
  const end = new Date(form.value.end_at)
  if (!title) {
    errorMessage.value = '填写日程标题'
    return
  }
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    errorMessage.value = '填写开始和结束时间'
    return
  }
  if (end <= start) {
    errorMessage.value = '结束时间需要晚于开始时间'
    return
  }

  isSaving.value = true
  const result = await scheduleStore.updateSchedule(event.value.id, {
    title,
    notes: form.value.notes.trim() || null,
    start_at: start.toISOString(),
    end_at: end.toISOString()
  })
  isSaving.value = false
  if (!result.success) {
    errorMessage.value = result.error || '保存日程失败'
    return
  }
  errorMessage.value = ''
}

// 删除后日程已不在列表里，收起面板并让外层清掉选中项
const remove = async () => {
  if (!event.value) return
  if (!window.confirm(`删除日程「${event.value.title}」吗？`)) return

  const target = event.value
  const result = await scheduleStore.deleteSchedule(target.id)
  if (!result.success) {
    errorMessage.value = result.error || '删除日程失败'
    return
  }
  emit('event-deleted', target.id)
  emit('close')
}
</script>

<template>
  <div v-if="show" data-detail-panel :class="[
    'relative max-w-full h-full min-h-0 bg-surface dark:bg-surface-dark flex flex-col z-20 border-l border-hairline dark:border-hairline-dark'
  ]" :style="{ width: panelWidth + 'px' }">
    <!-- 左缘拖拽条与任务详情面板一致，宽度独立保存 -->
    <div
      class="absolute inset-y-0 -left-1 z-40 w-2 cursor-col-resize touch-none transition-colors"
      :class="panelCollapseArmed ? 'bg-accent-700/60' : panelResizing ? 'bg-accent-500/50' : 'hover:bg-accent-500/30'"
      role="separator"
      aria-orientation="vertical"
      title="拖拽调整宽度，继续拖动即收起"
      @pointerdown="startResize"
    ></div>

    <div class="shrink-0 h-12 flex items-center justify-between px-3 border-b border-hairline dark:border-hairline-dark">
      <span class="eyebrow">日程详情</span>
      <button type="button"
        class="p-1.5 -mr-1 rounded text-neutral-400 hover:bg-accent-50 hover:text-accent-800 dark:hover:bg-accent-500/10 dark:hover:text-accent-200 transition-colors"
        title="关闭" @click="emit('close')">
        <AppIcon name="close" :size="15" />
      </button>
    </div>

    <!-- 空状态：没有选中日程时提示从列表里点选 -->
    <div v-if="!event"
      class="flex-1 h-full flex items-center justify-center px-6 text-center text-neutral-400 dark:text-neutral-600">
      <div>
        <AppIcon name="calendar" :size="20" class="mx-auto mb-2" />
        <p class="text-sm text-neutral-500">选择一个日程查看详情</p>
      </div>
    </div>

    <div v-else class="flex-1 min-h-0 overflow-auto px-4 py-3 space-y-3">
      <p class="text-[11px] text-neutral-500 dark:text-neutral-400">{{ startLabel }}</p>

      <label class="block">
        <span class="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">标题</span>
        <input v-model="form.title" class="field" type="text" placeholder="日程标题" />
      </label>

      <div class="grid grid-cols-1 gap-2">
        <label class="block">
          <span class="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">开始</span>
          <input v-model="form.start_at" class="field" type="datetime-local" />
        </label>
        <label class="block">
          <span class="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">结束</span>
          <input v-model="form.end_at" class="field" type="datetime-local" />
        </label>
      </div>

      <label class="block">
        <span class="mb-1 block text-[11px] text-neutral-500 dark:text-neutral-400">备注</span>
        <textarea v-model="form.notes" class="field resize-none" rows="5"
          placeholder="地点、参与人或其他说明"></textarea>
      </label>

      <p v-if="errorMessage" class="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
        <AppIcon name="alert" :size="12" />
        <span>{{ errorMessage }}</span>
      </p>
    </div>

    <footer v-if="event" class="shrink-0 flex items-center gap-2 px-4 py-3 border-t border-hairline dark:border-hairline-dark">
      <button class="btn-outline text-rose-600 dark:text-rose-400" :disabled="isSaving" @click="remove">
        <AppIcon name="trash" :size="13" />
        <span>删除</span>
      </button>
      <button class="btn-primary ml-auto" :disabled="isSaving" @click="save">
        <span>{{ isSaving ? '保存中…' : '保存' }}</span>
      </button>
    </footer>
  </div>
</template>
