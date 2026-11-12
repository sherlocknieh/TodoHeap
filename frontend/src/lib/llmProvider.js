// 第三方模型接入：OpenAI 兼容协议的预设、配置归一化与流式对话

export const LLM_PRESETS = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4.1-mini', 'gpt-4o-mini', 'gpt-4o'] },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-flash', 'deepseek-chat', 'deepseek-reasoner'] },
  { id: 'moonshot', label: 'Moonshot / Kimi', baseUrl: 'https://api.moonshot.cn/v1', models: ['moonshot-v1-8k', 'kimi-k2-0905-preview'] },
  { id: 'zhipu', label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4.5', 'glm-4-flash'] },
  { id: 'dashscope', label: '阿里百炼', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-plus', 'qwen-max'] },
  { id: 'gemini', label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', models: ['gemini-2.0-flash', 'gemini-2.5-flash'] },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', models: ['openai/gpt-4o-mini', 'anthropic/claude-sonnet-4'] },
  { id: 'ollama', label: 'Ollama（本地）', baseUrl: 'http://localhost:11434/v1', models: ['qwen3', 'llama3.1'] },
  { id: 'custom', label: '自定义（OpenAI 兼容）', baseUrl: '', models: [] }
]

export const LLM_MODES = [
  { id: 'byok', label: '自带 API Key', description: '直连你选择的服务商，密钥只存本机' },
  { id: 'builtin', label: '内置模型', description: '经 TodoHeap 网关调用，订阅后可用' }
]

export const DEFAULT_LLM_CONFIG = {
  mode: 'byok',
  presetId: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4.1-mini',
  builtinModel: '',
  temperature: 0.2,
  reasoningEffort: 'off'
}

// 思考等级：关闭时让 DeepSeek 显式走非思考模式，其余服务商不传该参数
// 浮层按强度从高到低展示，关闭作为兜底放在最后
export const REASONING_EFFORTS = [
  { id: 'high', label: '高', description: '深度推理，耗时更长' },
  { id: 'low', label: '低', description: '少量思考，响应更快' },
  { id: 'off', label: '关闭', description: 'DeepSeek 走非思考模式，其它服务商不传思考参数' }
]

const REASONING_EFFORT_IDS = REASONING_EFFORTS.map((item) => item.id)

// 中档已并入高档，旧配置读取时折算，避免丢回默认
const REASONING_EFFORT_ALIASES = { medium: 'high' }

// 兼容旧配置与空值：始终返回完整字段，避免界面拿到 undefined
export const normalizeLlmConfig = (source) => {
  const input = source && typeof source === 'object' ? source : {}
  if (Object.keys(input).length === 0) return { ...DEFAULT_LLM_CONFIG }

  const baseUrl = typeof input.baseUrl === 'string' ? input.baseUrl.trim() : ''
  const matchedPreset = LLM_PRESETS.find((preset) => preset.id === input.presetId && preset.id !== 'custom')
    || LLM_PRESETS.find((preset) => preset.id !== 'custom' && preset.baseUrl && preset.baseUrl === baseUrl)
  const reasoningEffortInput = REASONING_EFFORT_ALIASES[input.reasoningEffort] || input.reasoningEffort

  return {
    mode: input.mode === 'builtin' ? 'builtin' : 'byok',
    presetId: matchedPreset?.id || 'custom',
    baseUrl,
    apiKey: typeof input.apiKey === 'string' ? input.apiKey.trim() : '',
    model: typeof input.model === 'string' ? input.model.trim() : '',
    builtinModel: typeof input.builtinModel === 'string' ? input.builtinModel.trim() : '',
    temperature: Number.isFinite(Number(input.temperature))
      ? Math.min(2, Math.max(0, Number(input.temperature)))
      : DEFAULT_LLM_CONFIG.temperature,
    reasoningEffort: REASONING_EFFORT_IDS.includes(reasoningEffortInput)
      ? reasoningEffortInput
      : DEFAULT_LLM_CONFIG.reasoningEffort
  }
}

// 允许直接填完整的 chat/completions 地址，也允许只填到 /v1
export const resolveChatUrl = (baseUrl) => {
  const trimmed = String(baseUrl || '').trim().replace(/\/+$/, '')
  if (!trimmed) throw new LlmError('请先填写 Base URL')
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed
  return `${trimmed}/chat/completions`
}

export class LlmError extends Error {
  constructor(message, { status = 0, body = null } = {}) {
    super(message)
    this.name = 'LlmError'
    this.status = status
    this.body = body
  }
}

// 部分服务商在响应末尾附带用量；字段缺失时返回 null，不猜数值
const normalizeUsage = (usage) => {
  if (!usage || typeof usage !== 'object') return null
  const prompt = Number(usage.prompt_tokens) || 0
  const completion = Number(usage.completion_tokens) || 0
  const total = Number(usage.total_tokens) || prompt + completion
  if (!prompt && !completion && !total) return null
  return { prompt, completion, total }
}

// 流式增量累加器：文本直接透传，工具调用按 index 拼接完整参数
export const createStreamAccumulator = () => {
  const toolCalls = new Map()
  let content = ''
  let reasoning = ''
  let usage = null

  return {
    pushContent(delta) {
      if (typeof delta !== 'string' || !delta) return ''
      content += delta
      return delta
    },
    // 思考内容各家字段不同，统一累加到 reasoning
    pushReasoning(delta) {
      if (typeof delta !== 'string' || !delta) return ''
      reasoning += delta
      return delta
    },
    pushToolCalls(list) {
      if (!Array.isArray(list)) return
      list.forEach((part, fallbackIndex) => {
        const index = Number.isInteger(part?.index) ? part.index : fallbackIndex
        const current = toolCalls.get(index) || { id: '', name: '', arguments: '' }
        if (part?.id) current.id = part.id
        if (part?.function?.name) current.name += part.function.name
        if (part?.function?.arguments) current.arguments += part.function.arguments
        toolCalls.set(index, current)
      })
    },
    pushUsage(value) {
      usage = normalizeUsage(value) || usage
    },
    result() {
      return {
        content,
        reasoning,
        usage,
        toolCalls: [...toolCalls.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([, call], index) => ({
            id: call.id || `call_${Date.now()}_${index}`,
            type: 'function',
            function: {
              name: call.name,
              arguments: call.arguments || '{}'
            }
          }))
          .filter((call) => call.function.name)
      }
    }
  }
}

const readErrorMessage = (payload) => {  if (!payload) return ''
  if (typeof payload === 'string') return payload
  if (payload.error?.message) return payload.error.message
  if (payload.message) return payload.message
  return ''
}

// 思考内容在不同服务商下叫法不同，按优先级取第一个非空字段
const readReasoning = (source) => {
  if (!source || typeof source !== 'object') return ''
  const value = source.reasoning_content ?? source.reasoning ?? source.thinking
  return typeof value === 'string' ? value : ''
}

const normalizeMessage = (message) => {
  if (!message) return { content: '', reasoning: '', toolCalls: [] }
  return {
    content: typeof message.content === 'string' ? message.content : '',
    reasoning: readReasoning(message),
    toolCalls: (message.tool_calls || []).map((call, index) => ({
      id: call.id || `call_${Date.now()}_${index}`,
      type: 'function',
      function: {
        name: call.function?.name || '',
        arguments: call.function?.arguments || '{}'
      }
    })).filter((call) => call.function.name)
  }
}

// 读取网关实际提供的模型；返回 warning 时由设置页退回手动填写
export const fetchGatewayModels = async ({ endpoint, apiKey, extraHeaders, signal }) => {
  const headers = { ...(extraHeaders || {}) }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  let response
  try {
    response = await fetch(endpoint, { method: 'GET', headers, signal })
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    throw new LlmError('无法连接内置模型网关：请确认 llm_gateway 已部署')
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new LlmError(`网关返回 ${response.status}${text ? `：${text.slice(0, 200)}` : ''}`, {
      status: response.status
    })
  }

  const payload = await response.json().catch(() => null)
  const list = Array.isArray(payload?.models) ? payload.models : []
  return {
    models: list.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()),
    warning: typeof payload?.warning === 'string' ? payload.warning : ''
  }
}

// 请求体是协议的唯一事实来源：实际发送与界面快照共用同一份构造
export const buildChatRequestBody = ({ model, messages, temperature = 0.2, tools, reasoningEffort = 'off' }) => {
  const body = { model, messages, temperature, stream: true }
  if (Array.isArray(tools) && tools.length) {
    body.tools = tools
    body.tool_choice = 'auto'
  }
  // 关闭思考：DeepSeek 默认开启，要用 thinking 开关压掉；其余服务商保持不传
  if (reasoningEffort && reasoningEffort !== 'off') {
    body.reasoning_effort = reasoningEffort
  } else if (/^deepseek/i.test(String(model || ''))) {
    body.thinking = { type: 'disabled' }
  }
  return body
}

// 调用一次 OpenAI 兼容聊天接口；流式返回时通过 onDelta 实时反馈文本
export const streamChatCompletion = async ({
  baseUrl,
  endpoint,
  apiKey,
  extraHeaders,
  model,
  temperature = 0.2,
  messages,
  tools,
  reasoningEffort = 'off',
  signal,
  onDelta,
  onReasoning
}) => {
  if (!model) throw new LlmError('请先填写模型名称')

  const headers = { 'Content-Type': 'application/json', ...(extraHeaders || {}) }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  const body = buildChatRequestBody({ model, messages, temperature, tools, reasoningEffort })

  const url = endpoint || resolveChatUrl(baseUrl)
  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal
    })
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    const target = endpoint ? '内置模型网关' : '模型服务'
    const hint = endpoint
      ? '请确认 llm_gateway 已部署（supabase functions deploy llm_gateway）'
      : '请检查 Base URL、网络，以及服务商是否允许浏览器直连（CORS）'
    throw new LlmError(`无法连接${target}：${hint}`)
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    let parsed = null
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = null
    }
    const detail = readErrorMessage(parsed) || text.slice(0, 300)
    throw new LlmError(`模型接口返回 ${response.status}${detail ? `：${detail}` : ''}`, {
      status: response.status,
      body: parsed || text
    })
  }

  const contentType = response.headers.get('content-type') || ''
  // 部分服务商忽略 stream 参数，直接返回普通 JSON
  if (!response.body || !contentType.includes('text/event-stream')) {
    const payload = await response.json().catch(() => null)
    if (!payload) throw new LlmError('模型接口返回了无法解析的内容')
    if (payload.error) throw new LlmError(readErrorMessage(payload) || '模型接口返回错误', { body: payload })
    const normalized = normalizeMessage(payload.choices?.[0]?.message)
    if (normalized.content) onDelta?.(normalized.content)
    if (normalized.reasoning) onReasoning?.(normalized.reasoning)
    return { ...normalized, usage: normalizeUsage(payload.usage) }
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const accumulator = createStreamAccumulator()
  let buffer = ''
  let finished = false

  const consumeLine = (line) => {
    if (!line || line.startsWith(':') || !line.startsWith('data:')) return
    const payload = line.slice(5).trim()
    if (payload === '[DONE]') {
      finished = true
      return
    }
    let json
    try {
      json = JSON.parse(payload)
    } catch {
      return
    }
    if (json.error) throw new LlmError(readErrorMessage(json) || '模型接口返回错误', { body: json })
    // 用量块通常没有 choices，先于 choice 判断处理
    accumulator.pushUsage(json.usage)

    const choice = json.choices?.[0]
    if (!choice) return
    const delta = choice.delta || {}
    const contentDelta = accumulator.pushContent(delta.content)
    if (contentDelta) onDelta?.(contentDelta)
    const reasoningDelta = accumulator.pushReasoning(readReasoning(delta))
    if (reasoningDelta) onReasoning?.(reasoningDelta)
    accumulator.pushToolCalls(delta.tool_calls)

    // 少数服务商在流式响应里仍返回完整 message
    if (!delta.content && !delta.tool_calls && choice.message) {
      const normalized = normalizeMessage(choice.message)
      if (normalized.content) {
        accumulator.pushContent(normalized.content)
        onDelta?.(normalized.content)
      }
      if (normalized.reasoning) {
        accumulator.pushReasoning(normalized.reasoning)
        onReasoning?.(normalized.reasoning)
      }
      accumulator.pushToolCalls(normalized.toolCalls.map((call, index) => ({
        index,
        id: call.id,
        function: call.function
      })))
    }
  }

  while (!finished) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      consumeLine(buffer.slice(0, newlineIndex).trim())
      buffer = buffer.slice(newlineIndex + 1)
      if (finished) break
      newlineIndex = buffer.indexOf('\n')
    }
  }
  if (!finished && buffer.trim()) consumeLine(buffer.trim())

  const result = accumulator.result()
  return { content: result.content, reasoning: result.reasoning, tool_calls: result.toolCalls, usage: result.usage }
}
