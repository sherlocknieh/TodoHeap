// 第三方模型接入：OpenAI 兼容协议的预设、配置归一化与流式对话

export const LLM_PRESETS = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4.1-mini', 'gpt-4o-mini', 'gpt-4o'] },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-reasoner'] },
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

// 内置模式可选的模型建议；实际可用范围由网关的 LLM_ALLOWED_MODELS 决定
export const BUILTIN_MODELS = ['deepseek-chat', 'deepseek-v4-flash', 'gpt-4.1-mini']

export const DEFAULT_LLM_CONFIG = {
  mode: 'byok',
  presetId: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4.1-mini',
  builtinModel: BUILTIN_MODELS[0],
  temperature: 0.2
}

// 兼容旧配置与空值：始终返回完整字段，避免界面拿到 undefined
export const normalizeLlmConfig = (source) => {
  const input = source && typeof source === 'object' ? source : {}
  if (Object.keys(input).length === 0) return { ...DEFAULT_LLM_CONFIG }

  const baseUrl = typeof input.baseUrl === 'string' ? input.baseUrl.trim() : ''
  const matchedPreset = LLM_PRESETS.find((preset) => preset.id === input.presetId && preset.id !== 'custom')
    || LLM_PRESETS.find((preset) => preset.id !== 'custom' && preset.baseUrl && preset.baseUrl === baseUrl)

  return {
    mode: input.mode === 'builtin' ? 'builtin' : 'byok',
    presetId: matchedPreset?.id || 'custom',
    baseUrl,
    apiKey: typeof input.apiKey === 'string' ? input.apiKey.trim() : '',
    model: typeof input.model === 'string' ? input.model.trim() : '',
    builtinModel: typeof input.builtinModel === 'string' && input.builtinModel.trim()
      ? input.builtinModel.trim()
      : BUILTIN_MODELS[0],
    temperature: Number.isFinite(Number(input.temperature))
      ? Math.min(2, Math.max(0, Number(input.temperature)))
      : DEFAULT_LLM_CONFIG.temperature
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

// 流式增量累加器：文本直接透传，工具调用按 index 拼接完整参数
export const createStreamAccumulator = () => {
  const toolCalls = new Map()
  let content = ''

  return {
    pushContent(delta) {
      if (typeof delta !== 'string' || !delta) return ''
      content += delta
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
    result() {
      return {
        content,
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

const readErrorMessage = (payload) => {
  if (!payload) return ''
  if (typeof payload === 'string') return payload
  if (payload.error?.message) return payload.error.message
  if (payload.message) return payload.message
  return ''
}

const normalizeMessage = (message) => {
  if (!message) return { content: '', toolCalls: [] }
  return {
    content: typeof message.content === 'string' ? message.content : '',
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
  signal,
  onDelta
}) => {
  if (!model) throw new LlmError('请先填写模型名称')

  const headers = { 'Content-Type': 'application/json', ...(extraHeaders || {}) }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  const body = {
    model,
    messages,
    temperature,
    stream: true
  }
  if (Array.isArray(tools) && tools.length) {
    body.tools = tools
    body.tool_choice = 'auto'
  }

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
    throw new LlmError('无法连接模型服务：请检查 Base URL、网络，以及服务商是否允许浏览器直连（CORS）')
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
    return normalized
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

    const choice = json.choices?.[0]
    if (!choice) return
    const delta = choice.delta || {}
    const contentDelta = accumulator.pushContent(delta.content)
    if (contentDelta) onDelta?.(contentDelta)
    accumulator.pushToolCalls(delta.tool_calls)

    // 少数服务商在流式响应里仍返回完整 message
    if (!delta.content && !delta.tool_calls && choice.message) {
      const normalized = normalizeMessage(choice.message)
      if (normalized.content) {
        accumulator.pushContent(normalized.content)
        onDelta?.(normalized.content)
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
  return { content: result.content, tool_calls: result.toolCalls }
}
