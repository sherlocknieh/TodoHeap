<template>
  <div class="sync-indicator">
    <div class="status-container">
      <!-- 已同步状态 -->
      <div v-show="syncStatus === 'idle'" class="status-badge status-synced">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="9,12 12,15 17,10" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="label">已同步</span>
      </div>
      
      <!-- 同步中状态 -->
      <div v-show="syncStatus === 'syncing'" class="status-badge status-syncing">
        <svg class="icon spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" stroke-linecap="round"/>
        </svg>
        <span class="label">同步中</span>
        <span class="pending-count">({{ pendingCount }})</span>
      </div>
      
      <!-- 离线状态 -->
      <div v-show="syncStatus === 'offline'" class="status-badge status-offline">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" stroke-linecap="round" stroke-linejoin="round"/>
          <line x1="2" y1="2" x2="22" y2="22" stroke-linecap="round"/>
        </svg>
        <span class="label">离线</span>
        <span v-if="pendingCount > 0" class="pending-count">({{ pendingCount }})</span>
      </div>
      
      <!-- 错误状态 -->
      <div v-show="syncStatus === 'error'" class="status-badge status-error" @click="handleRetry">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12" stroke-linecap="round"/>
          <line x1="12" y1="16" x2="12.01" y2="16" stroke-linecap="round"/>
        </svg>
        <span class="label">同步失败</span>
        <span class="retry-hint">点击重试</span>
      </div>
    </div>
    
    <!-- 详情弹窗 -->
    <Transition name="popup">
      <div v-if="showDetails && (syncStatus === 'error' || pendingCount > 0)" class="details-popup">
        <div class="popup-header">
          <span>同步队列</span>
          <button @click="showDetails = false" class="close-btn">×</button>
        </div>
        <div class="popup-content">
          <div v-if="lastError" class="error-message">
            <span class="error-icon">⚠️</span>
            {{ lastError }}
          </div>
          <div v-if="pendingCount > 0" class="pending-info">
            <span>{{ pendingCount }} 个操作待同步</span>
          </div>
          <button v-if="syncStatus === 'error'" @click="handleRetry" class="retry-btn">
            重试同步
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSyncQueueStore, SyncStatus } from '../stores/syncQueue'
import { storeToRefs } from 'pinia'

const syncQueueStore = useSyncQueueStore()
const { syncStatus, pendingCount, lastError, isOnline } = storeToRefs(syncQueueStore)

const showDetails = ref(false)

// 点击状态指示器时展开详情
const toggleDetails = () => {
  if (syncStatus.value === 'error' || pendingCount.value > 0) {
    showDetails.value = !showDetails.value
  }
}

// 重试同步
const handleRetry = () => {
  syncQueueStore.retryQueue()
  showDetails.value = false
}

// 初始化：恢复队列
onMounted(async () => {
  await syncQueueStore.restoreQueue()
})

// 点击外部关闭详情
const handleOutsideClick = (e) => {
  if (!e.target.closest('.sync-indicator')) {
    showDetails.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleOutsideClick)
})

onUnmounted(() => {
  document.removeEventListener('click', handleOutsideClick)
})
</script>

<style scoped>
.sync-indicator {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.status-container {
  position: relative;
  width: 100px;
  height: 30px;
}

.status-badge {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s ease, background-color 0.2s ease;
  white-space: nowrap;
}

.status-badge:hover {
  filter: brightness(0.97);
}

.icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 已同步状态 */
.status-synced {
  background-color: #ecfdf5;
  color: #059669;
  border: 1px solid #a7f3d0;
}

/* 同步中状态 */
.status-syncing {
  background-color: #eff6ff;
  color: #2563eb;
  border: 1px solid #bfdbfe;
}

/* 离线状态 */
.status-offline {
  background-color: #f8fafc;
  color: #64748b;
  border: 1px solid #e2e8f0;
}

.pending-count {
  font-size: 10px;
  opacity: 0.8;
}

.label {
  flex-shrink: 0;
}

/* 错误状态 */
.status-error {
  background-color: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
}

.retry-hint {
  font-size: 10px;
  opacity: 0.7;
}

/* 详情弹窗 */
.details-popup {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 8px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
  border: 1px solid #e2e8f0;
  min-width: 240px;
  z-index: 100;
}

.popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
  font-weight: 600;
  font-size: 13px;
  color: #334155;
}

.close-btn {
  background: none;
  border: none;
  font-size: 18px;
  color: #94a3b8;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.close-btn:hover {
  color: #64748b;
}

.popup-content {
  padding: 12px 16px;
}

.error-message {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px;
  background: #fef2f2;
  border-radius: 6px;
  color: #dc2626;
  font-size: 12px;
  margin-bottom: 12px;
}

.error-icon {
  flex-shrink: 0;
}

.pending-info {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 12px;
}

.retry-btn {
  width: 100%;
  padding: 8px 16px;
  background: #4f46e5;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.retry-btn:hover {
  background: #4338ca;
}

/* 过渡动画 */
.popup-enter-active,
.popup-leave-active {
  transition: all 0.2s ease;
}

.popup-enter-from,
.popup-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
