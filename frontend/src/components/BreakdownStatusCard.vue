<template>
  <Transition
    enter-active-class="transition ease-out duration-300"
    enter-from-class="opacity-0 -translate-y-2"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition ease-in duration-200"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 -translate-y-2"
  >
    <div v-if="visible" class="breakdown-wrapper">
      <!-- 分解进行中状态 -->
      <div v-if="isProcessing" class="breakdown-card breakdown-card--processing">
        <div class="breakdown-header">
          <div class="breakdown-status">
            <svg class="breakdown-icon spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" stroke-linecap="round"/>
            </svg>
            <div class="breakdown-title">
              <span class="breakdown-label">AI 正在分解任务</span>
              <span v-if="taskCount > 0" class="breakdown-count">
                已生成 {{ taskCount }} 个子任务
              </span>
            </div>
          </div>
        </div>
        <!-- 实时显示子任务列表 -->
        <TransitionGroup
          v-if="tasks.length > 0"
          tag="ul"
          name="task-list"
          class="breakdown-task-list"
        >
          <li
            v-for="task in tasks"
            :key="task.id"
            class="breakdown-task-item"
          >
            <svg class="breakdown-task-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20,6 9,17 4,12" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class="breakdown-task-title">{{ task.title }}</span>
          </li>
        </TransitionGroup>
      </div>

      <!-- 待确认状态（预览模式） -->
      <div v-else-if="status === 'pending'" class="breakdown-card breakdown-card--pending">
        <div class="breakdown-header">
          <div class="breakdown-status">
            <svg class="breakdown-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <div class="breakdown-title">
              <span class="breakdown-label">AI 已生成 {{ taskCount }} 个子任务</span>
              <span class="breakdown-count">请确认是否保存到任务列表</span>
            </div>
          </div>
        </div>
        <!-- 显示待确认的子任务列表 -->
        <ul v-if="tasks.length > 0" class="breakdown-task-list">
          <li
            v-for="task in tasks"
            :key="task.id"
            class="breakdown-task-item"
          >
            <svg class="breakdown-task-pending" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
            </svg>
            <span class="breakdown-task-title">{{ task.title }}</span>
          </li>
        </ul>
        <!-- 确认/取消按钮 -->
        <div class="breakdown-actions">
          <button class="breakdown-btn breakdown-btn--cancel" @click="$emit('cancel')">
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" stroke-linecap="round"/>
              <line x1="6" y1="6" x2="18" y2="18" stroke-linecap="round"/>
            </svg>
            取消
          </button>
          <button class="breakdown-btn breakdown-btn--confirm" @click="$emit('confirm')">
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20,6 9,17 4,12" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            保存全部
          </button>
        </div>
      </div>

      <!-- 成功状态 -->
      <div v-else-if="status === 'success'" class="breakdown-card breakdown-card--success">
        <div class="breakdown-header">
          <div class="breakdown-status">
            <svg class="breakdown-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke-linecap="round" stroke-linejoin="round"/>
              <polyline points="22,4 12,14.01 9,11.01" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class="breakdown-label">{{ message }}</span>
          </div>
        </div>
      </div>

      <!-- 错误状态 -->
      <div v-else-if="status === 'error'" class="breakdown-card breakdown-card--error">
        <div class="breakdown-header">
          <div class="breakdown-status">
            <svg class="breakdown-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12" stroke-linecap="round"/>
              <line x1="12" y1="16" x2="12.01" y2="16" stroke-linecap="round"/>
            </svg>
            <span class="breakdown-label">{{ message }}</span>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  // 是否正在处理中
  isProcessing: {
    type: Boolean,
    default: false
  },
  // 状态消息
  message: {
    type: String,
    default: ''
  },
  // 状态类型: 'success' | 'error' | 'pending' | ''
  status: {
    type: String,
    default: ''
  },
  // 已生成的任务数量
  taskCount: {
    type: Number,
    default: 0
  },
  // 已生成的任务列表
  tasks: {
    type: Array,
    default: () => []
  }
})

// 定义事件
defineEmits(['confirm', 'cancel'])

// 是否显示组件
const visible = computed(() => {
  return props.isProcessing || props.message || props.status === 'pending'
})
</script>

<style scoped>
/* ========== 包装器 ========== */
.breakdown-wrapper {
  margin: 0;
}

/* ========== AI 分解状态卡片 ========== */
.breakdown-card {
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: all 0.2s ease;
}

.breakdown-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

/* 处理中状态 */
.breakdown-card--processing {
  background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%);
  border-color: #c7d2fe;
  color: #4338ca;
}

/* 成功状态 */
.breakdown-card--success {
  background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
  border-color: #a7f3d0;
  color: #047857;
}

/* 错误状态 */
.breakdown-card--error {
  background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
  border-color: #fecaca;
  color: #b91c1c;
}

/* 待确认状态 */
.breakdown-card--pending {
  background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
  border-color: #fcd34d;
  color: #92400e;
}

/* 头部 */
.breakdown-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.breakdown-status {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.breakdown-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.breakdown-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.breakdown-label {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}

.breakdown-count {
  font-size: 12px;
  font-weight: 500;
  opacity: 0.8;
}

/* 子任务列表 */
.breakdown-task-list {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(99, 102, 241, 0.15);
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
}

/* 滚动条样式 */
.breakdown-task-list::-webkit-scrollbar {
  width: 4px;
}

.breakdown-task-list::-webkit-scrollbar-track {
  background: transparent;
}

.breakdown-task-list::-webkit-scrollbar-thumb {
  background: rgba(99, 102, 241, 0.3);
  border-radius: 2px;
}

.breakdown-task-list::-webkit-scrollbar-thumb:hover {
  background: rgba(99, 102, 241, 0.5);
}

.breakdown-task-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 8px;
  font-size: 13px;
  color: #1e1b4b;
  backdrop-filter: blur(4px);
  border: 1px solid rgba(99, 102, 241, 0.1);
}

.breakdown-task-check {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: #10b981;
}

.breakdown-task-pending {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: #f59e0b;
}

.breakdown-task-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

/* ========== TransitionGroup 动画 ========== */
.task-list-enter-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.task-list-leave-active {
  transition: all 0.2s ease-in;
}

.task-list-enter-from {
  opacity: 0;
  transform: translateX(-16px) scale(0.95);
}

.task-list-leave-to {
  opacity: 0;
  transform: translateX(16px) scale(0.95);
}

.task-list-move {
  transition: transform 0.3s ease;
}

/* ========== 旋转动画 ========== */
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.spinning {
  animation: spin 1s linear infinite;
}

/* ========== 操作按钮区域 ========== */
.breakdown-actions {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(245, 158, 11, 0.2);
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.breakdown-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
}

.breakdown-btn:hover {
  transform: translateY(-1px);
}

.breakdown-btn:active {
  transform: translateY(0);
}

.btn-icon {
  width: 16px;
  height: 16px;
}

.breakdown-btn--cancel {
  background: rgba(255, 255, 255, 0.8);
  color: #6b7280;
  border: 1px solid #d1d5db;
}

.breakdown-btn--cancel:hover {
  background: #f3f4f6;
  color: #374151;
}

.breakdown-btn--confirm {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  box-shadow: 0 2px 4px rgba(16, 185, 129, 0.3);
}

.breakdown-btn--confirm:hover {
  box-shadow: 0 4px 8px rgba(16, 185, 129, 0.4);
}
</style>