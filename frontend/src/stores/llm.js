// 模型接入状态：自带密钥只存本机，内置模型经 Supabase 网关转发
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { supabase, supabasePubKey, supabaseUrl } from '@/lib/supabase'
import {
  DEFAULT_LLM_CONFIG,
  LLM_MODES,
  LLM_PRESETS,
  fetchGatewayModels,
  normalizeLlmConfig,
  streamChatCompletion
} from '@/lib/llmProvider'

const STORAGE_KEY = 'todoheap.llm.v1'
const BUILTIN_ENDPOINT = `${supabaseUrl}/functions/v1/llm_gateway`

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
  const builtinModels = ref([])
  const modelsLoading = ref(false)
  const modelsWarning = ref('')

  const isBuiltin = computed(() => config.value.mode === 'builtin')
  const activeModel = computed(() => (isBuiltin.value ? config.value.builtinModel : config.value.model))
  const isConfigured = computed(() => (isBuiltin.value
    ? Boolean(config.value.builtinModel)
    : Boolean(config.value.baseUrl && config.value.model)))

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

  // 内置模式用当前会话的 JWT 作为凭证，网关据此识别用户与订阅状态
  const getAccessToken = async () => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new Error('登录状态已失效，请重新登录')
    return token
  }

  // 模型列表由网关决定：优先平台白名单，其次上游 /models
  const loadBuiltinModels = async ({ force = false } = {}) => {
    if (modelsLoading.value) return builtinModels.value
    if (!force && builtinModels.value.length) return builtinModels.value

    modelsLoading.value = true
    modelsWarning.value = ''
    try {
      const token = await getAccessToken()
      const result = await fetchGatewayModels({
        endpoint: BUILTIN_ENDPOINT,
        apiKey: token,
        extraHeaders: { apikey: supabasePubKey }
      })
      builtinModels.value = result.models
      modelsWarning.value = result.warning
      // 已保存的模型不在实际列表中时自动纠正，避免继续调用已下线的型号
      if (result.models.length && !result.models.includes(config.value.builtinModel)) {
        update({ builtinModel: result.models[0] })
      }
      return result.models
    } catch (err) {
      modelsWarning.value = err?.message || '读取模型列表失败'
      return []
    } finally {
      modelsLoading.value = false
    }
  }

  // 两种模式只在请求目标与凭证上不同，Agent 与工具层无需感知
  const request = async ({ messages, tools, temperature = config.value.temperature, onDelta, onReasoning, signal }) => {
    if (isBuiltin.value) {
      const token = await getAccessToken()
      return streamChatCompletion({
        endpoint: BUILTIN_ENDPOINT,
        apiKey: token,
        extraHeaders: { apikey: supabasePubKey },
        model: config.value.builtinModel,
        temperature,
        messages,
        tools,
        reasoningEffort: config.value.reasoningEffort,
        onDelta,
        onReasoning,
        signal
      })
    }

    return streamChatCompletion({
      baseUrl: config.value.baseUrl,
      apiKey: config.value.apiKey,
      model: config.value.model,
      temperature,
      messages,
      tools,
      reasoningEffort: config.value.reasoningEffort,
      onDelta,
      onReasoning,
      signal
    })
  }

  const chat = async ({ messages, tools, onDelta, onReasoning, signal }) => {
    if (!isConfigured.value) throw new Error('请先在设置 → 模型接入中配置模型')
    return request({ messages, tools, onDelta, onReasoning, signal })
  }

  // 发一条最小请求验证地址、凭证与模型名是否可用
  const testConnection = async () => {
    if (!isConfigured.value) return { success: false, error: '请先完成模型配置' }
    const startedAt = Date.now()
    try {
      const result = await request({
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
    modes: LLM_MODES,
    presets: LLM_PRESETS,
    builtinModels,
    modelsLoading,
    modelsWarning,
    isBuiltin,
    activeModel,
    isConfigured,
    update,
    reset,
    loadBuiltinModels,
    chat,
    testConnection
  }
})
