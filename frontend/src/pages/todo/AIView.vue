<script setup>
import AgentChat from '@/components/AgentChat.vue'

const props = defineProps({
  selectedTaskId: { type: [Number, String], default: null }
})
</script>

<template>
  <!-- AI 视图：对话式 Agent，直接读写任务、日程与偏好 -->
  <div class="h-full flex flex-col min-h-0 w-full">
    <AgentChat :selected-task-id="props.selectedTaskId" />
  </div>
</template>
