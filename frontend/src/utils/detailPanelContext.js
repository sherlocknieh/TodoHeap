import { ref } from 'vue'
import { persistedRef } from './uiState'

export const TODO_DETAIL_PANEL_CONTEXT = Symbol('todo-detail-panel-context')

export const DETAIL_PANEL_MIN_WIDTH = 260

// 详情右栏宽度：面板拖拽写这一份，页面外壳与任务图读同一份
export const detailPanelWidth = persistedRef('detail-width', 320, {
  validate: (value) => Number.isFinite(value) && value >= DETAIL_PANEL_MIN_WIDTH
})

// 浮在任务图上的右栏实际占用宽度：页面外壳按视图、开合与视口上限写入，导图直接读
export const detailPanelInset = ref(0)
