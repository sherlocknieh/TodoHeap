// 按角色汇总一次请求的字符构成；token 按 3 字符的经验比例估算
export const summarizeRequest = (request) => {
  if (!request || !Array.isArray(request.messages)) return null

  let system = 0
  let history = 0
  let tools = 0

  request.messages.forEach((message) => {
    const length = typeof message.content === 'string' ? message.content.length : 0
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
