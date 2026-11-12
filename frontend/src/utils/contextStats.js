// 按上下文四类汇总一次请求的字符构成；token 按 3 字符的经验比例估算
const contentLength = (content) => {
  if (typeof content === 'string') return content.length
  if (!Array.isArray(content)) return 0
  // 多模态消息只统计文本，图片按固定占位计入，避免把 base64 当正文
  return content.reduce((sum, part) => {
    if (part?.type === 'text') return sum + String(part.text || '').length
    if (part?.type === 'image_url') return sum + 8
    return sum
  }, 0)
}

export const summarizeRequest = (request) => {
  if (!request || !Array.isArray(request.messages)) return null

  let system = 0
  let tools = 0
  let reasoning = 0
  let toolCalls = 0
  let toolOutput = 0
  let messages = 0
  let reasoningCount = 0
  let toolCallCount = 0

  request.messages.forEach((message) => {
    const length = contentLength(message.content)
    if (message.role === 'system') {
      system += length
      return
    }
    if (message.role === 'tool') {
      toolOutput += length
      return
    }
    messages += length
    // 思考内容随 assistant 消息一起回传，单独成类以便看出推理与正文各占多少
    if (typeof message.reasoning_content === 'string' && message.reasoning_content.length) {
      reasoning += message.reasoning_content.length
      reasoningCount += 1
    }
    // 工具调用的入参只出现在 assistant 消息的 tool_calls 里
    message.tool_calls?.forEach((call) => {
      toolCalls += (call.function?.arguments || '').length
      toolCallCount += 1
    })
  })

  // 工具定义随请求发送，同样占用上下文
  if (Array.isArray(request.body?.tools)) tools += JSON.stringify(request.body.tools).length

  const total = system + tools + reasoning + toolCalls + toolOutput + messages
  return {
    system,
    tools,
    reasoning,
    reasoningCount,
    toolCalls,
    toolCallCount,
    toolOutput,
    messages,
    total,
    tokens: Math.ceil(total / 3)
  }
}
