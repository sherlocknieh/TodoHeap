// 模型接入状态：配置只保存在本机浏览器，读取后由 Agent 直接调用
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  DEFAULT_LLM_CONFIG,
  LLM_PRESETS,
  normalizeLlmConfig,
  streamChatCompletion
} from '@/lib/llmProvider'

const STORAGE_KEY = 'todoheap.llm.v1'

const readStoredConfig = () => {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_LLM_CONFIG }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return normalizeLlmConfig(raw ? JSON.parse(raw) : DEFAULT_LLM_CONFIG)
  } catch {
    return { ...DEFAULT_LLM_CONFIG }
  }
}

export const useLlmStore = defineStore('llm', () => {
  const config = ref(readStoredConfig())

  const isConfigured = computed(() => Boolean(config.value.baseUrl && config.value.model))

  const persist = () => {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config.value))
    } catch {
      // 隐私模式下写入可能失败，配置仅本次会话有效
    }
  }

  const update = (patch) => {
    config.value = normalizeLlmConfig({ ...config.value, ...patch })
    persist()
  }

  const reset = () => {
    config.value = { ...DEFAULT_LLM_CONFIG }
    persist()
  }

  const chat = async ({ messages, tools, onDelta, signal }) => {
    if (!isConfigured.value) throw new Error('请先在设置 → 模型接入中配置模型')
    return streamChatCompletion({
      ...config.value,
      messages,
      tools,
      onDelta,
      signal
    })
  }

  // 发一条最小请求验证地址、密钥与模型名是否可用
  const testConnection = async () => {
    if (!isConfigured.value) return { success: false, error: '请先填写 Base URL 与模型名称' }
    const startedAt = Date.now()
    try {
      const result = await streamChatCompletion({
        ...config.value,
        messages: [{ role: 'user', content: '只回复 ok' }],
        temperature: 0
      })
      const text = (result.content || '').trim()
      return {
        success: true,
        message: text ? `连接成功，模型回复：${text.slice(0, 40)}` : '连接成功',
        elapsedMs: Date.now() - startedAt
      }
    } catch (err) {
      return { success: false, error: err?.message || '连接失败' }
    }
  }

  return {
    config,
    presets: LLM_PRESETS,
    isConfigured,
    update,
    reset,
    chat,
    testConnection
  }
})
