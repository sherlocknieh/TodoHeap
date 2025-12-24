import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useOnline } from '@vueuse/core'
import localforage from 'localforage'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '../libs/supabase'

// 初始化 localforage 实例
const syncStorage = localforage.createInstance({
  name: 'todoheap',
  storeName: 'syncQueue'
})

// 操作类型常量
export const OperationType = {
  ADD: 'ADD',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  RESTORE: 'RESTORE',
  PERMANENT_DELETE: 'PERMANENT_DELETE',
  BATCH_RESTORE: 'BATCH_RESTORE',
  BATCH_PERMANENT_DELETE: 'BATCH_PERMANENT_DELETE'
}

// 同步状态常量
export const SyncStatus = {
  IDLE: 'idle',           // 空闲，已同步
  SYNCING: 'syncing',     // 同步中
  OFFLINE: 'offline',     // 离线
  ERROR: 'error'          // 有错误
}

export const useSyncQueueStore = defineStore('syncQueue', () => {
  // 状态
  const queue = ref([])                    // 同步队列
  const isProcessing = ref(false)          // 是否正在处理队列
  const lastError = ref(null)              // 最后的错误
  const tempIdMap = ref(new Map())         // 临时ID -> 真实ID 映射表
  const snapshots = ref(new Map())         // 快照存储 (用于回滚)
  const isOnline = useOnline()             // 网络状态
  const activeOperations = ref(new Set())  // 正在执行的操作ID
  const processingTargets = ref(new Set()) // 正在处理的 targetId 集合
  const isReceivingRemote = ref(false)     // 是否正在接收远程更新
  let remoteUpdateTimer = null             // 远程更新定时器

  // 并发配置
  const MAX_CONCURRENT = 5                 // 最大并发数

  // 计算同步状态
  const syncStatus = computed(() => {
    if (!isOnline.value) return SyncStatus.OFFLINE
    if (lastError.value) return SyncStatus.ERROR
    if (isProcessing.value || queue.value.length > 0 || isReceivingRemote.value) return SyncStatus.SYNCING
    return SyncStatus.IDLE
  })
  
  // 标记收到远程更新（短暂显示同步中状态）
  const markRemoteUpdate = () => {
    isReceivingRemote.value = true
    // 清除之前的定时器
    if (remoteUpdateTimer) {
      clearTimeout(remoteUpdateTimer)
    }
    // 500ms 后自动清除
    remoteUpdateTimer = setTimeout(() => {
      isReceivingRemote.value = false
    }, 500)
  }

  // 计算队列中待处理的操作数
  const pendingCount = computed(() => queue.value.length)

  // 是否有未同步的更改
  const hasUnsyncedChanges = computed(() => queue.value.length > 0)

  // 生成临时ID (负数)
  let tempIdCounter = -1
  const generateTempId = () => {
    return tempIdCounter--
  }

  // 判断是否是临时ID
  const isTempId = (id) => {
    return typeof id === 'number' && id < 0
  }

  // 获取真实ID (如果存在映射则返回映射的ID，否则返回原ID)
  const getRealId = (id) => {
    return tempIdMap.value.get(id) ?? id
  }

  // 更新队列中后续操作的目标ID (当临时ID被替换时)
  const updateQueueTargetIds = (oldId, newId) => {
    queue.value.forEach(item => {
      if (item.targetId === oldId) {
        item.targetId = newId
      }
      // 处理 payload 中可能包含的 parent_id
      if (item.payload?.parent_id === oldId) {
        item.payload.parent_id = newId
      }
    })
  }

  // 保存快照 (用于回滚)
  const saveSnapshot = (id, data) => {
    snapshots.value.set(id, JSON.parse(JSON.stringify(data)))
  }

  // 获取快照
  const getSnapshot = (id) => {
    return snapshots.value.get(id)
  }

  // 清除快照
  const clearSnapshot = (id) => {
    snapshots.value.delete(id)
  }

  // 添加操作到队列
  const enqueue = async (operation) => {
    const item = {
      id: uuidv4(),
      ...operation,
      timestamp: Date.now(),
      retryCount: 0
    }
    queue.value.push(item)
    await persistQueue()
    
    // 如果在线且没有在处理，开始处理队列
    if (isOnline.value && !isProcessing.value) {
      processQueue()
    }
    
    return item.id
  }

  // 持久化队列到 IndexedDB
  const persistQueue = async () => {
    try {
      await syncStorage.setItem('queue', JSON.parse(JSON.stringify(queue.value)))
      await syncStorage.setItem('tempIdMap', Array.from(tempIdMap.value.entries()))
    } catch (e) {
      console.error('持久化队列失败:', e)
    }
  }

  // 从 IndexedDB 恢复队列
  const restoreQueue = async () => {
    try {
      const savedQueue = await syncStorage.getItem('queue')
      if (savedQueue && Array.isArray(savedQueue)) {
        queue.value = savedQueue
      }
      
      const savedTempIdMap = await syncStorage.getItem('tempIdMap')
      if (savedTempIdMap && Array.isArray(savedTempIdMap)) {
        tempIdMap.value = new Map(savedTempIdMap)
      }
      
      // 如果有待处理的操作且在线，开始处理
      if (queue.value.length > 0 && isOnline.value && !isProcessing.value) {
        processQueue()
      }
    } catch (e) {
      console.error('恢复队列失败:', e)
    }
  }

  // 指数退避计算
  const getBackoffDelay = (retryCount) => {
    const baseDelay = 1000
    const maxDelay = 30000
    const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay)
    // 添加抖动
    return delay + Math.random() * 1000
  }

  // 处理队列 (并行版本)
  const processQueue = async () => {
    if (isProcessing.value || queue.value.length === 0 || !isOnline.value) {
      return
    }

    isProcessing.value = true
    lastError.value = null

    // 持续处理直到队列为空
    while (queue.value.length > 0 && isOnline.value) {
      // 找出可以并行执行的操作
      const executableItems = selectExecutableItems()
      
      if (executableItems.length === 0) {
        // 没有可执行的操作（可能都在等待依赖），等待一下
        await new Promise(resolve => setTimeout(resolve, 100))
        continue
      }

      // 并行执行选中的操作
      const promises = executableItems.map(item => executeWithRetry(item))
      await Promise.all(promises)
    }

    isProcessing.value = false
  }

  // 选择可以并行执行的操作
  const selectExecutableItems = () => {
    const items = []
    const selectedTargets = new Set()

    for (const item of queue.value) {
      // 跳过已经在执行的操作
      if (activeOperations.value.has(item.id)) continue
      
      // 跳过 targetId 正在被处理的操作（保证同一目标串行）
      if (processingTargets.value.has(item.targetId)) continue
      
      // 跳过本轮已选中相同 targetId 的操作
      if (selectedTargets.has(item.targetId)) continue

      // 检查依赖：如果 parent_id 是临时ID且还没有映射，需要等待
      if (item.payload?.parent_id && isTempId(item.payload.parent_id)) {
        const realParentId = getRealId(item.payload.parent_id)
        if (isTempId(realParentId)) {
          // 父任务还没有真实ID，跳过
          continue
        }
      }

      items.push(item)
      selectedTargets.add(item.targetId)

      // 达到最大并发数就停止选择
      if (items.length >= MAX_CONCURRENT) break
    }

    return items
  }

  // 带重试的执行单个操作
  const executeWithRetry = async (item) => {
    activeOperations.value.add(item.id)
    processingTargets.value.add(item.targetId)

    try {
      const result = await executeOperation(item)
      
      if (result.success) {
        // 操作成功，从队列移除
        removeFromQueue(item.id)
        clearSnapshot(item.targetId)
        await persistQueue()
      } else if (result.isNetworkError) {
        // 网络错误，增加重试计数
        item.retryCount++
        await persistQueue()
        
        // 等待后会在下一轮重试
        const delay = getBackoffDelay(item.retryCount)
        console.log(`操作 ${item.id} 网络错误，${delay}ms 后重试...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      } else {
        // 业务错误，触发回滚，从队列移除
        console.error('业务错误，触发回滚:', result.error)
        lastError.value = result.error
        removeFromQueue(item.id)
        await persistQueue()
        
        if (result.needsRollback) {
          triggerRollback(item)
        }
      }
    } catch (e) {
      console.error('队列处理异常:', e)
      item.retryCount++
      
      if (item.retryCount >= 5) {
        lastError.value = e.message
        removeFromQueue(item.id)
        triggerRollback(item)
      }
      await persistQueue()
    } finally {
      activeOperations.value.delete(item.id)
      processingTargets.value.delete(item.targetId)
    }
  }

  // 从队列移除指定操作
  const removeFromQueue = (operationId) => {
    const index = queue.value.findIndex(item => item.id === operationId)
    if (index !== -1) {
      queue.value.splice(index, 1)
    }
  }

  // 执行单个操作
  const executeOperation = async (item) => {
    const { type, payload, targetId } = item
    
    // 获取真实ID (可能已被映射)
    const realTargetId = getRealId(targetId)
    
    try {
      switch (type) {
        case OperationType.ADD:
          return await executeAdd(item)
        
        case OperationType.UPDATE:
          return await executeUpdate(realTargetId, payload)
        
        case OperationType.DELETE:
          return await executeDelete(realTargetId)
        
        case OperationType.RESTORE:
          return await executeRestore(realTargetId)
        
        case OperationType.PERMANENT_DELETE:
          return await executePermanentDelete(realTargetId)
        
        case OperationType.BATCH_RESTORE:
          return await executeBatchRestore(payload)
        
        case OperationType.BATCH_PERMANENT_DELETE:
          return await executeBatchPermanentDelete(payload)
        
        default:
          return { success: false, error: '未知操作类型', needsRollback: true }
      }
    } catch (e) {
      // 判断是否是网络错误
      const isNetworkError = !navigator.onLine || 
        e.message?.includes('Failed to fetch') ||
        e.message?.includes('Network') ||
        e.code === 'NETWORK_ERROR'
      
      return { 
        success: false, 
        error: e.message, 
        isNetworkError,
        needsRollback: !isNetworkError
      }
    }
  }

  // 执行添加操作
  const executeAdd = async (item) => {
    const { payload, targetId } = item
    
    // 构建插入数据 (排除临时ID)
    const insertData = { ...payload }
    delete insertData.id
    
    // 如果 parent_id 是临时ID，需要替换为真实ID
    if (insertData.parent_id && isTempId(insertData.parent_id)) {
      const realParentId = getRealId(insertData.parent_id)
      if (isTempId(realParentId)) {
        // 父任务还没有真实ID，等待
        return { success: false, isNetworkError: true }
      }
      insertData.parent_id = realParentId
    }

    const { data, error } = await supabase
      .from('todos')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      // 检查是否是认证错误
      if (error.code === '401' || error.message?.includes('JWT')) {
        return { success: false, error: '认证已过期，请重新登录', needsRollback: false, isAuthError: true }
      }
      throw error
    }

    // 更新临时ID映射
    if (isTempId(targetId)) {
      tempIdMap.value.set(targetId, data.id)
      updateQueueTargetIds(targetId, data.id)
      await persistQueue()
    }

    // 通知 todoStore 更新ID
    const event = new CustomEvent('sync:id-replaced', {
      detail: { tempId: targetId, realId: data.id, data }
    })
    window.dispatchEvent(event)

    return { success: true, data }
  }

  // 执行更新操作
  const executeUpdate = async (id, payload) => {
    const { data, error } = await supabase
      .from('todos')
      .update(payload)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === '401' || error.message?.includes('JWT')) {
        return { success: false, error: '认证已过期，请重新登录', needsRollback: false, isAuthError: true }
      }
      throw error
    }

    // 通知更新成功
    const event = new CustomEvent('sync:update-success', {
      detail: { id, data }
    })
    window.dispatchEvent(event)

    return { success: true, data }
  }

  // 执行删除操作 (软删除)
  const executeDelete = async (id) => {
    const { error } = await supabase
      .from('todos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      if (error.code === '401' || error.message?.includes('JWT')) {
        return { success: false, error: '认证已过期，请重新登录', needsRollback: false, isAuthError: true }
      }
      throw error
    }

    return { success: true }
  }

  // 执行恢复操作
  const executeRestore = async (id) => {
    const { data, error } = await supabase
      .from('todos')
      .update({ deleted_at: null })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === '401' || error.message?.includes('JWT')) {
        return { success: false, error: '认证已过期，请重新登录', needsRollback: false, isAuthError: true }
      }
      throw error
    }

    return { success: true, data }
  }

  // 执行永久删除操作
  const executePermanentDelete = async (id) => {
    const { error } = await supabase
      .from('todos')
      .delete()
      .eq('id', id)

    if (error) {
      if (error.code === '401' || error.message?.includes('JWT')) {
        return { success: false, error: '认证已过期，请重新登录', needsRollback: false, isAuthError: true }
      }
      throw error
    }

    return { success: true }
  }

  // 执行批量恢复操作
  const executeBatchRestore = async (payload) => {
    const { user_id } = payload
    
    const { data, error } = await supabase
      .from('todos')
      .update({ deleted_at: null })
      .eq('user_id', user_id)
      .not('deleted_at', 'is', null)
      .select()

    if (error) {
      if (error.code === '401' || error.message?.includes('JWT')) {
        return { success: false, error: '认证已过期，请重新登录', needsRollback: false, isAuthError: true }
      }
      throw error
    }

    // 通知批量恢复成功
    const event = new CustomEvent('sync:batch-restore-success', {
      detail: { data }
    })
    window.dispatchEvent(event)

    return { success: true, data }
  }

  // 执行批量永久删除操作
  const executeBatchPermanentDelete = async (payload) => {
    const { user_id } = payload
    
    const { error } = await supabase
      .from('todos')
      .delete()
      .eq('user_id', user_id)
      .not('deleted_at', 'is', null)

    if (error) {
      if (error.code === '401' || error.message?.includes('JWT')) {
        return { success: false, error: '认证已过期，请重新登录', needsRollback: false, isAuthError: true }
      }
      throw error
    }

    return { success: true }
  }

  // 触发回滚
  const triggerRollback = (item) => {
    const event = new CustomEvent('sync:rollback', {
      detail: { item, snapshot: getSnapshot(item.targetId) }
    })
    window.dispatchEvent(event)
  }

  // 清除错误状态
  const clearError = () => {
    lastError.value = null
  }

  // 监听网络状态变化
  watch(isOnline, (online) => {
    if (online && queue.value.length > 0 && !isProcessing.value) {
      console.log('网络恢复，开始处理队列...')
      processQueue()
    }
  })

  // 强制重试队列
  const retryQueue = () => {
    lastError.value = null
    if (isOnline.value && !isProcessing.value) {
      processQueue()
    }
  }

  // 清空队列 (危险操作，仅用于特殊情况)
  const clearQueue = async () => {
    queue.value = []
    tempIdMap.value.clear()
    snapshots.value.clear()
    await persistQueue()
  }

  return {
    // 状态
    queue,
    isProcessing,
    lastError,
    isOnline,
    syncStatus,
    pendingCount,
    hasUnsyncedChanges,
    
    // 方法
    generateTempId,
    isTempId,
    getRealId,
    saveSnapshot,
    getSnapshot,
    clearSnapshot,
    enqueue,
    persistQueue,
    restoreQueue,
    processQueue,
    clearError,
    retryQueue,
    clearQueue,
    updateQueueTargetIds,
    markRemoteUpdate,
    
    // 常量
    OperationType,
    SyncStatus
  }
})
