// 按角色汇总一次请求的字符构成；token 按 3 字符的经验比例估算
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
  let history = 0
  let tools = 0

  request.messages.forEach((message) => {
    const length = contentLength(message.content)
    if (message.role === 'system') {
      system += length
    } else if (message.role === 'tool') {
      tools += length
    } else {
      history += length
      message.tool_calls?.forEach((call) => {
        history += (call.function?.arguments || '').length
      })
    }
  })

  const total = system + history + tools
  return { system, history, tools, total, tokens: Math.ceil(total / 3) }
}
