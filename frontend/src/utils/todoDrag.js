// 拖拽状态跨行共享：每行是独立组件，源任务与落点提示必须放在组件之外
import { ref } from 'vue'

export const draggingTodoId = ref(null)
export const dropIndicator = ref(null)

export const resetDragState = () => {
  draggingTodoId.value = null
  dropIndicator.value = null
}
