// 通用 MCP 服务接入：服务配置、JSON-RPC 握手、工具列举与调用
// 浏览器直连第三方 MCP 常被 CORS 拦住，所有请求经 Supabase 边缘函数 mcp_gateway 转发
import { supabase, supabasePubKey, supabaseUrl } from '@/lib/supabase'

export const MCP_GATEWAY_ENDPOINT = `${supabaseUrl}/functions/v1/mcp_gateway`
export const MCP_PROTOCOL_VERSION = '2025-06-18'
export const MCP_STORAGE_KEY = 'todoheap.mcp.v1'
export const MAX_MCP_NAME = 32
export const MAX_MCP_TOOLS = 60

// 内置预设：滴答清单的地址与鉴权方式固定，用户只需点一次添加
// 令牌复用「设置 → 导入数据」里的滴答授权，不必再授权一次
export const MCP_PRESETS = [
  {
    id: 'dida',
    name: '滴答清单',
    endpoint: 'https://mcp.dida365.com/',
    description: '读取清单与任务，导入时按任务 ID 去重',
    requiresDidaAuth: true
  }
]

export const findMcpPreset = (id) => MCP_PRESETS.find((preset) => preset.id === id) || null

// 已经添加过的预设不再重复出现在「一键添加」里
export const findPresetServer = (servers, presetId) => (
  (Array.isArray(servers) ? servers : []).find((server) => server?.presetId === presetId) || null
)

const LOGIN_EXPIRED_MESSAGE = '登录状态已失效，请重新登录'
const TOOL_PREFIX = 'mcp__'
// 预设需要先走第三方授权：记下待添加的预设，回跳后自动补上
const PENDING_PRESET_KEY = 'todoheap.mcp.pending-preset'

const messageOf = (err) => (err instanceof Error ? err.message : String(err ?? ''))

const storage = () => (typeof window === 'undefined' ? null : window.localStorage)

// 工具名要满足模型侧的命名约束，先由服务名与工具名拼出稳定前缀
const slug = (value) => String(value ?? '')
  .toLowerCase()
  .replace(/[^a-z0-9_-]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 16) || 'server'

export const createMcpId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `mcp_${crypto.randomUUID()}`
  return `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// 配置全部留在本机浏览器：地址、令牌与工具快照都只属于当前设备
export const normalizeMcpServer = (server, fallbackId) => {
  if (!server || typeof server !== 'object') return null
  const name = String(server.name ?? '').trim().slice(0, MAX_MCP_NAME)
  const endpoint = String(server.endpoint ?? '').trim()
  if (!name || !endpoint) return null
  return {
    id: typeof server.id === 'string' && server.id ? server.id : (fallbackId || createMcpId()),
    // 预设标识用于识别内置服务，手填的服务为空
    presetId: typeof server.presetId === 'string' ? server.presetId : '',
    name,
    endpoint,
    token: String(server.token ?? '').trim(),
    enabled: server.enabled !== false,
    tools: Array.isArray(server.tools)
      ? server.tools.filter((tool) => tool && typeof tool.name === 'string' && tool.name)
      : [],
    error: typeof server.error === 'string' ? server.error : '',
    updatedAt: typeof server.updatedAt === 'string' ? server.updatedAt : new Date().toISOString()
  }
}

export const normalizeMcpServers = (list) => {
  if (!Array.isArray(list)) return []
  const seen = new Set()
  return list.reduce((servers, item) => {
    const server = normalizeMcpServer(item)
    if (!server || seen.has(server.id)) return servers
    seen.add(server.id)
    return [...servers, server]
  }, [])
}

// 按账号分开存：同一台设备换账号登录时不会用到别人的服务令牌
const keyFor = (userId) => `${MCP_STORAGE_KEY}.${userId || 'anon'}`

export const readMcpServers = (userId) => {
  const store = storage()
  if (!store) return []
  try {
    return normalizeMcpServers(JSON.parse(store.getItem(keyFor(userId)) ?? '[]'))
  } catch {
    return []
  }
}

export const saveMcpServers = (userId, servers) => {
  const store = storage()
  if (!store) return
  try {
    store.setItem(keyFor(userId), JSON.stringify(normalizeMcpServers(servers)))
  } catch {
    // 隐私模式下写入失败时配置只在本次页面有效
  }
}

export const createMcpServer = ({ name, endpoint, token = '', presetId = '' } = {}) => normalizeMcpServer({
  name,
  endpoint,
  token,
  presetId,
  enabled: true,
  tools: []
})

const sessionStorageOf = () => (typeof window === 'undefined' ? null : window.sessionStorage)

export const markPendingPreset = (presetId) => {
  const store = sessionStorageOf()
  if (store) store.setItem(PENDING_PRESET_KEY, String(presetId || ''))
}

export const readPendingPreset = () => {
  const store = sessionStorageOf()
  if (!store) return ''
  return store.getItem(PENDING_PRESET_KEY) || ''
}

export const clearPendingPreset = () => {
  const store = sessionStorageOf()
  if (store) store.removeItem(PENDING_PRESET_KEY)
}

// 令牌是否还会在接下来几分钟内有效，过期就先重新授权
export const isTokenFresh = (auth, skewMs = 60_000) => (
  Boolean(auth?.accessToken) && (!auth.expiresAt || auth.expiresAt - skewMs > Date.now())
)

// 把预设展开成一份服务配置；令牌由调用方按预设的鉴权方式补齐
export const createMcpServerFromPreset = (preset, { token = '' } = {}) => (
  preset ? createMcpServer({
    name: preset.name,
    endpoint: preset.endpoint,
    token,
    presetId: preset.id
  }) : null
)

// 工具名全局唯一：不同服务里有同名工具时靠服务前缀区分
// 函数名上限 64 字符：前缀 + 服务 slug + 工具名要一起控制长度
export const mcpToolName = (server, toolName) => (
  `${TOOL_PREFIX}${slug(server.name)}__${String(toolName).replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40)}`
)

export const isMcpToolName = (name) => String(name ?? '').startsWith(TOOL_PREFIX)

// 反查服务：工具名里带的是服务名 slug，重命名后旧名字自然失效
export const findMcpServerForTool = (servers, toolName) => servers.find((server) => (
  String(toolName ?? '').startsWith(`${TOOL_PREFIX}${slug(server.name)}__`)
)) || null

// 网关调用统一带上当前会话 JWT，网关据此识别用户
const callGateway = async ({ endpoint, token, sessionId, rpc }) => {
  const { data } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token
  if (!accessToken) throw new Error(LOGIN_EXPIRED_MESSAGE)

  const response = await fetch(MCP_GATEWAY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: supabasePubKey
    },
    body: JSON.stringify({ endpoint, token: token || '', sessionId: sessionId || '', rpc })
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok || body?.error) {
    const error = new Error(body?.error || 'MCP 网关调用失败')
    error.unauthorized = Boolean(body?.unauthorized)
    throw error
  }
  return body
}

// 每个服务的会话头只在内存里保留：页面刷新后重新握手即可
const sessionIds = new Map()
let rpcSequence = 100

const rpcCall = async (server, body) => {
  const next = await callGateway({
    endpoint: server.endpoint,
    token: server.token,
    sessionId: sessionIds.get(server.id) ?? '',
    rpc: body
  })
  if (next.sessionId) sessionIds.set(server.id, next.sessionId)
  return next.payload
}

// JSON-RPC 错误与工具执行错误都要转成可读文案
const unwrapPayload = (payload) => {
  if (!payload) throw new Error('MCP 服务没有返回内容')
  if (payload.error) throw new Error(payload.error.message || 'MCP 服务调用失败')
  return payload.result ?? payload
}

// 握手只做一次；地址或令牌变了就丢掉旧会话头重新开始
const ensureSession = async (server) => {
  const key = `${server.endpoint}:${server.token}`
  if (sessionIds.get(`${server.id}:ready`) === key) return
  sessionIds.delete(server.id)

  await rpcCall(server, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'TodoHeap', version: '1.0.0' }
    }
  })
  await rpcCall(server, {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {}
  }).catch(() => {
    // 通知不回包，失败也不影响后续调用
  })
  sessionIds.set(`${server.id}:ready`, key)
}

// 工具列表可能分页，按 nextCursor 一页页取完
export const listMcpTools = async (server) => {
  if (!server?.endpoint) throw new Error('MCP 服务地址为空')
  await ensureSession(server)

  const tools = []
  let cursor = ''
  for (let page = 0; page < 5; page += 1) {
    rpcSequence += 1
    const result = unwrapPayload(await rpcCall(server, {
      jsonrpc: '2.0',
      id: rpcSequence,
      method: 'tools/list',
      params: cursor ? { cursor } : {}
    }))

    ;(result?.tools ?? []).forEach((tool) => {
      if (!tool?.name || tools.length >= MAX_MCP_TOOLS) return
      tools.push({
        name: String(tool.name),
        title: String(tool.title ?? ''),
        description: String(tool.description ?? '').slice(0, 600),
        inputSchema: tool.inputSchema && typeof tool.inputSchema === 'object' ? tool.inputSchema : null,
        readOnly: tool.annotations?.readOnlyHint === true
      })
    })

    cursor = result?.nextCursor ? String(result.nextCursor) : ''
    if (!cursor || tools.length >= MAX_MCP_TOOLS) break
  }
  return tools
}

// 工具返回内容优先取结构化字段，其次拼接文本块
export const readMcpToolResult = (payload) => {
  const result = unwrapPayload(payload)
  const texts = (Array.isArray(result?.content) ? result.content : [])
    .filter((item) => item?.type === 'text' && item.text)
    .map((item) => item.text)

  if (result?.isError) throw new Error(texts.join('\n') || 'MCP 工具执行失败')
  if (result?.structuredContent !== undefined) return result.structuredContent
  return texts.join('\n') || null
}

export const callMcpTool = async ({ server, toolName, args }) => {
  if (!server?.endpoint) throw new Error('MCP 服务未配置')
  await ensureSession(server)
  rpcSequence += 1
  const payload = await rpcCall(server, {
    jsonrpc: '2.0',
    id: rpcSequence,
    method: 'tools/call',
    params: { name: toolName, arguments: args && typeof args === 'object' ? args : {} }
  })
  return readMcpToolResult(payload)
}

// 删除或停用服务时清掉内存里的会话，避免下次复用失效的会话头
export const forgetMcpSession = (serverId) => {
  sessionIds.delete(serverId)
  sessionIds.delete(`${serverId}:ready`)
}

// 连接测试 = 握手 + 列举工具，失败原因直接交给界面展示
export const connectMcpServer = async (server) => {
  try {
    const tools = await listMcpTools(server)
    return { success: true, tools }
  } catch (err) {
    return { success: false, error: messageOf(err) }
  }
}

// 工具 schema 可能缺字段或带非标准约束，统一收敛成模型可接受的 object
const sanitizeSchema = (schema) => {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return { type: 'object', properties: {} }
  }
  const { $schema, ...rest } = schema
  return {
    ...rest,
    type: 'object',
    properties: rest.properties && typeof rest.properties === 'object' ? rest.properties : {}
  }
}

// 已启用的服务把工具摊平成 OpenAI 函数定义，模型据此直接调用
export const buildMcpToolDefinitions = (servers) => (
  (Array.isArray(servers) ? servers : [])
    .filter((server) => server?.enabled && Array.isArray(server.tools) && server.tools.length)
    .flatMap((server) => server.tools.map((tool) => ({
      type: 'function',
      function: {
        name: mcpToolName(server, tool.name),
        description: `来自 ${server.name} 的 MCP 工具${tool.title ? `（${tool.title}）` : ''}：${tool.description || '外部服务提供的能力'}`,
        parameters: sanitizeSchema(tool.inputSchema)
      }
    })))
)

// 工具元数据用于确认提示与只读判定
export const findMcpToolMeta = (servers, toolName) => {
  const server = findMcpServerForTool(servers, toolName)
  if (!server) return null
  const tool = (server.tools || []).find((item) => mcpToolName(server, item.name) === toolName)
  return tool ? { server, tool } : null
}

// 服务没声明只读时按写操作处理，宁可多确认一次
export const isMcpReadOnlyTool = (servers, toolName) => {
  const meta = findMcpToolMeta(servers, toolName)
  return Boolean(meta?.tool?.readOnly)
}

// 界面文案：把 mcp__服务__工具 还原成「服务 / 工具」
export const mcpToolLabel = (toolName) => {
  const raw = String(toolName ?? '')
  if (!raw.startsWith(TOOL_PREFIX)) return raw
  const [, rest] = raw.split(TOOL_PREFIX)
  const separator = rest.indexOf('__')
  if (separator === -1) return rest
  return `${rest.slice(0, separator)} / ${rest.slice(separator + 2)}`
}
