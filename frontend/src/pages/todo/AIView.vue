<script setup>
import AgentChat from '@/components/AgentChat.vue'

const props = defineProps({
  selectedTaskId: { type: [Number, String], default: null }
})
const emit = defineEmits(['open-sidebar'])
</script>

<template>
  <!-- AI 视图：对话式 Agent，会话列表由左侧栏承载 -->
  <div class="h-full flex flex-col min-h-0 w-full">
    <AgentChat :selected-task-id="props.selectedTaskId" @open-sidebar="emit('open-sidebar')" />
  </div>
</template>
