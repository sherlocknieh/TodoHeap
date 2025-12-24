import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const STORAGE_KEY = 'todoheap_settings'

export const useSettingsStore = defineStore('settings', () => {
  // 设置项
  const autoApplyAITasks = ref(false) // 是否立即应用 AI 生成的子任务，默认为否
  
  // 从 localStorage 加载设置
  const loadSettings = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const settings = JSON.parse(saved)
        if (typeof settings.autoApplyAITasks === 'boolean') {
          autoApplyAITasks.value = settings.autoApplyAITasks
        }
      }
    } catch (e) {
      console.warn('Failed to load settings:', e)
    }
  }
  
  // 保存设置到 localStorage
  const saveSettings = () => {
    try {
      const settings = {
        autoApplyAITasks: autoApplyAITasks.value
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch (e) {
      console.warn('Failed to save settings:', e)
    }
  }
  
  // 监听变化自动保存
  watch(autoApplyAITasks, saveSettings)
  
  // 初始化时加载设置
  loadSettings()
  
  return {
    autoApplyAITasks,
    loadSettings,
    saveSettings
  }
})