// 拖拽状态跨行共享：每行是独立组件，源任务与落点提示必须放在组件之外。
// 同时记住源任务当前所在的父级，供落点按父级上下文重排或换父级。
import { ref } from 'vue'

export const draggingTodoId = ref(null)
export const draggingParentTodoId = ref(null)
export const dropIndicator = ref(null)

export const resetDragState = () => {
  draggingTodoId.value = null
  draggingParentTodoId.value = null
  dropIndicator.value = null
}
