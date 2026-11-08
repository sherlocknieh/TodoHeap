// 滴答清单 MCP 接入：OAuth 授权、MCP 工具调用与任务拉取
// 浏览器无法直连 mcp.dida365.com，所有请求都经 Supabase 边缘函数 dida_mcp 转发
// 拉取结果直接交给 ticktickImport 的 JSON 解析器，复用同一套预览、去重与写入流程

import { supabase, supabasePubKey, supabaseUrl } from '@/lib/supabase'
import { parseTickTickJson } from '@/lib/ticktickImport'

export const DIDA_GATEWAY_ENDPOINT = `${supabaseUrl}/functions/v1/dida_mcp`
export const DIDA_AUTHORIZE_ENDPOINT = 'https://dida365.com/oauth/authorize'
export const DIDA_SCOPE = 'tasks:read tasks:write'
export const DIDA_MCP_PROTOCOL_VERSION = '2025-06-18'

const AUTH_KEY_PREFIX = 'todoheap.dida-mcp.'
const CLIENT_KEY = 'todoheap.dida-mcp.client'
const PENDING_KEY = 'todoheap.dida-mcp.pending'
const CALLBACK_ERROR_KEY = 'todoheap.dida-mcp.callback-error'

const LOGIN_EXPIRED_MESSAGE = '登录状态已失效，请重新登录'

const storage = () => (typeof window === 'undefined' ? null : window.localStorage)
const sessionStore = () => (typeof window === 'undefined' ? null : window.sessionStorage)

const messageOf = (err) => (err instanceof Error ? err.message : String(err ?? ''))

// 回跳地址固定为站点基路径，需与动态注册时声明的 redirect_uri 完全一致
export const didaRedirectUri = () => {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const base = import.meta.env?.BASE_URL || '/'
  return `${origin}${base}`
}

// 动态注册的客户端可以复用，避免每次连接都在滴答侧新建一个
const readCachedClient = (redirectUri) => {
  const store = storage()
  if (!store) return ''
  try {
    const cached = JSON.parse(store.getItem(CLIENT_KEY) ?? 'null')
    return cached?.redirectUri === redirectUri ? String(cached.clientId ?? '') : ''
  } catch {
    return ''
  }
}

const writeCachedClient = (redirectUri, clientId) => {
  const store = storage()
  if (!store || !clientId) return
  try {
    store.setItem(CLIENT_KEY, JSON.stringify({ redirectUri, clientId }))
  } catch {
    // 缓存失败只影响下次是否重新注册
  }
}

const clearCachedClient = () => {
  try {
    storage()?.removeItem(CLIENT_KEY)
  } catch {
    // 忽略存储不可用
  }
}

// 授权状态按账号分开保存，换账号登录不会用到上一个账号的令牌
export const readDidaAuth = (userId) => {
  const store = storage()
  if (!store || !userId) return null
  try {
    const raw = store.getItem(`${AUTH_KEY_PREFIX}${userId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.accessToken ? parsed : null
  } catch {
    return null
  }
}

export const saveDidaAuth = (userId, auth) => {
  const store = storage()
  if (!store || !userId) return
  try {
    store.setItem(`${AUTH_KEY_PREFIX}${userId}`, JSON.stringify(auth))
  } catch {
    // 隐私模式下写入失败时授权只在当前页面有效
  }
}

export const clearDidaAuth = (userId) => {
  const store = storage()
  if (!store || !userId) return
  try {
    store.removeItem(`${AUTH_KEY_PREFIX}${userId}`)
  } catch {
    // 忽略存储不可用
  }
}

export const readPendingDidaAuth = () => {
  const store = sessionStore()
  if (!store) return null
  try {
    const raw = store.getItem(PENDING_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const writePendingDidaAuth = (pending) => {
  const store = sessionStore()
  if (store) store.setItem(PENDING_KEY, JSON.stringify(pending))
}

const clearPendingDidaAuth = () => {
  const store = sessionStore()
  if (store) store.removeItem(PENDING_KEY)
}

// 授权失败原因留给设置页展示，回跳后地址栏已被清理，只能靠这里传递
export const readDidaCallbackError = () => {
  const store = sessionStore()
  if (!store) return ''
  const message = store.getItem(CALLBACK_ERROR_KEY) ?? ''
  store.removeItem(CALLBACK_ERROR_KEY)
  return message
}

const writeDidaCallbackError = (message) => {
  const store = sessionStore()
  if (store) store.setItem(CALLBACK_ERROR_KEY, message)
}

// PKCE 校验对：verifier 留在本地，challenge 随授权请求发给滴答
export const createPkcePair = async () => {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const verifier = toBase64Url(bytes)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return { verifier, challenge: toBase64Url(new Uint8Array(digest)) }
}

const toBase64Url = (bytes) => {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export const createDidaState = () => {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return toBase64Url(bytes)
}

export const buildDidaAuthorizeUrl = ({ clientId, redirectUri, challenge, state }) => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: DIDA_SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: 'https://mcp.dida365.com/'
  })
  return `${DIDA_AUTHORIZE_ENDPOINT}?${params.toString()}`
}

// 网关调用统一带上当前会话 JWT，网关据此识别用户
const callDidaGateway = async (action, payload = {}) => {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error(LOGIN_EXPIRED_MESSAGE)

  const response = await fetch(DIDA_GATEWAY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: supabasePubKey
    },
    body: JSON.stringify({ action, ...payload })
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok || body?.error) {
    const error = new Error(body?.error || '滴答清单网关调用失败')
    error.unauthorized = Boolean(body?.unauthorized)
    throw error
  }
  return body
}

// 开始授权：拿到客户端后整页跳转到滴答登录页
export const startDidaAuthorize = async () => {
  const redirectUri = didaRedirectUri()
  let clientId = readCachedClient(redirectUri)
  if (!clientId) {
    const result = await callDidaGateway('register', { redirectUri })
    clientId = result.clientId
    writeCachedClient(redirectUri, clientId)
  }

  const { verifier, challenge } = await createPkcePair()
  const state = createDidaState()

  writePendingDidaAuth({ clientId, verifier, state, redirectUri })
  window.location.assign(buildDidaAuthorizeUrl({ clientId, redirectUri, challenge, state }))
}

// 回跳后换令牌；返回授权结果，失败时抛出可直接展示的错误
export const completeDidaAuthorize = async (search = window.location.search) => {
  const params = new URLSearchParams(search)
  const code = params.get('code')
  if (!code) {
    const reason = params.get('error_description') || params.get('error')
    throw new Error(reason ? `滴答清单授权失败：${reason}` : '滴答清单授权未返回授权码')
  }

  const pending = readPendingDidaAuth()
  if (!pending || pending.state !== params.get('state')) {
    throw new Error('授权状态已失效，请重新连接')
  }

  const result = await callDidaGateway('token', {
    code,
    clientId: pending.clientId,
    codeVerifier: pending.verifier,
    redirectUri: pending.redirectUri
  })

  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user?.id
  if (!userId) throw new Error(LOGIN_EXPIRED_MESSAGE)

  const auth = {
    accessToken: result.accessToken,
    scope: result.scope,
    expiresAt: result.expiresIn ? Date.now() + result.expiresIn * 1000 : 0
  }
  saveDidaAuth(userId, auth)
  clearPendingDidaAuth()
  return auth
}

// 处理整页回跳：清理地址栏参数，把结果交给设置页
export const handleDidaCallback = async () => {
  if (typeof window === 'undefined') return false
  const search = window.location.search
  if (!search.includes('code=') || !readPendingDidaAuth()) return false

  window.history.replaceState(null, '', window.location.pathname + window.location.hash)
  try {
    await completeDidaAuthorize(search)
    return true
  } catch (err) {
    // 客户端可能已失效（例如换成平台应用），清掉缓存让下次重新注册
    clearCachedClient()
    writeDidaCallbackError(messageOf(err))
    return false
  }
}

// 取出工具返回的正文：优先结构化字段，其次解析文本里的 JSON
export const readToolPayload = (payload) => {
  if (!payload) throw new Error('滴答清单没有返回内容')
  if (payload.error) throw new Error(payload.error.message || '滴答清单调用失败')

  const result = payload.result ?? payload
  const text = (result?.content ?? [])
    .filter((item) => item?.type === 'text' && item.text)
    .map((item) => item.text)
    .join('\n')
    .trim()

  if (result?.isError) throw new Error(text || '滴答清单调用失败')
  if (result?.structuredContent) return result.structuredContent
  if (!text) return null

  const parsed = tryParseJson(text)
  return parsed ?? text
}

// 兼容模型在 JSON 外层包了代码块或说明文字的情况
const tryParseJson = (text) => {
  const candidates = [text]
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) candidates.push(fenced[1].trim())
  const firstBrace = text.search(/[[{]/)
  if (firstBrace > 0) candidates.push(text.slice(firstBrace))

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      // 继续尝试下一种切法
    }
  }
  return null
}

// 从任意层级的返回结果里取出数组，字段名在官方 MCP 各工具间并不统一
export const pickArray = (value, keys = []) => {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []

  const fields = [...keys, 'tasks', 'items', 'projects', 'list']
  for (const field of fields) {
    const candidate = value[field]
    if (Array.isArray(candidate)) return candidate
  }
  // 有些工具把结果再包一层 data / result
  for (const wrapper of ['data', 'result']) {
    const nested = value[wrapper]
    if (nested && nested !== value) {
      const found = pickArray(nested, keys)
      if (found.length) return found
    }
  }
  return []
}

const initializedTokens = new Set()
const sessionIds = new Map()
let rpcSequence = 100

// 上游下发会话头时记下来，后续请求原样带回
const callRpc = async (accessToken, body) => {
  const { payload, sessionId } = await callDidaGateway('rpc', {
    accessToken,
    sessionId: sessionIds.get(accessToken) ?? '',
    rpc: body
  })
  if (sessionId) sessionIds.set(accessToken, sessionId)
  return payload
}

// 每个令牌先握手一次，后续工具调用直接复用
const ensureSession = async (auth) => {
  if (initializedTokens.has(auth.accessToken)) return

  await callRpc(auth.accessToken, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: DIDA_MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'TodoHeap', version: '1.0.0' }
    }
  })
  await callRpc(auth.accessToken, {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {}
  }).catch(() => {
    // 通知不回包，失败也不影响后续调用
  })
  initializedTokens.add(auth.accessToken)
}

export const callDidaTool = async (name, args, auth) => {
  if (!auth?.accessToken) throw new Error('请先连接滴答清单')
  await ensureSession(auth)
  rpcSequence += 1
  const payload = await callRpc(auth.accessToken, {
    jsonrpc: '2.0',
    id: rpcSequence,
    method: 'tools/call',
    params: { name, arguments: args }
  })
  return readToolPayload(payload)
}

// 已完成任务在滴答里用 status=2 或完成时间标记，两种写法都要认
const isCompletedTask = (task) => String(task?.status ?? '') === '2' || Boolean(task?.completedTime)

// 整理成与备份 JSON 相同的结构：清单名补进任务，其余字段交给导入解析器判断
export const buildDidaImport = ({ projects = [], tasks = [], includeCompleted = true } = {}) => {
  const projectNames = new Map(projects.map((project) => [String(project.id), project.name ?? '']))
  const normalized = tasks
    .filter((task) => task && typeof task === 'object')
    .filter((task) => includeCompleted || !isCompletedTask(task))
    .map((task) => ({
      ...task,
      projectName: task.projectName
        || task.listName
        || projectNames.get(String(task.projectId ?? task.project_id ?? ''))
        || ''
    }))

  const parsed = parseTickTickJson(JSON.stringify({ projects, tasks: normalized }))
  return { tasks: parsed.tasks, warnings: parsed.warnings }
}

// 拉取全部任务：先取清单名，再取任务，最后交给导入解析器
export const fetchDidaTasks = async ({ auth, includeCompleted = true } = {}) => {
  if (!auth?.accessToken) throw new Error('请先连接滴答清单')

  const warnings = []
  const projects = []

  try {
    const rawProjects = pickArray(await callDidaTool('list_projects', {}, auth), ['projects', 'items'])
    rawProjects.forEach((project) => {
      const id = project?.id ?? project?.projectId
      if (!id) return
      projects.push({ id: String(id), name: String(project.name ?? project.title ?? '') })
    })
  } catch (err) {
    warnings.push(`未能读取清单列表：${messageOf(err)}`)
  }

  const tasksById = new Map()
  const collect = (payload) => {
    pickArray(payload, ['tasks', 'items', 'tasksList']).forEach((task) => {
      if (!task || typeof task !== 'object') return
      const id = task.id ?? task.taskId
      if (id) tasksById.set(String(id), task)
    })
  }

  try {
    collect(await callDidaTool('filter_tasks', { filter: {} }, auth))
  } catch (err) {
    warnings.push(`批量读取失败，改为逐个清单读取：${messageOf(err)}`)
  }

  // 批量读取没有结果时，逐个清单兜底
  if (!tasksById.size) {
    for (const project of projects) {
      try {
        collect(await callDidaTool('get_project_with_undone_tasks', { project_id: project.id }, auth))
      } catch {
        // 单个清单失败不影响其余清单
      }
    }
  }

  // 已完成任务只能按日期查询，交给滴答自己决定返回范围
  if (includeCompleted) {
    try {
      collect(await callDidaTool('list_completed_tasks_by_date', { search: {} }, auth))
    } catch (err) {
      warnings.push(`未能读取已完成任务：${messageOf(err)}`)
    }
  }

  const tasks = [...tasksById.values()]
  if (!tasks.length) throw new Error('滴答清单没有返回任务')

  const result = buildDidaImport({ projects, tasks, includeCompleted })
  return { ...result, warnings: [...warnings, ...result.warnings], projectCount: projects.length }
}
