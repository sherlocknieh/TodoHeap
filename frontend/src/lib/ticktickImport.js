// 滴答清单数据导入：把导出的 CSV/JSON 解析成任务树，并逐条写入 todos 表
// 解析与规划是纯函数，写入复用数据库的 create_todo RPC，保证 child_ids 与父任务同步维护
// JSON 导出带任务 ID，写入时落到 external_id 上，所以重复导入命中原记录并只更新有变化的字段

// 文件大小上限：超过后浏览器解析与逐条写入都会明显卡顿
export const TICKTICK_IMPORT_MAX_BYTES = 5 * 1024 * 1024

// 表头别名：滴答清单中英文客户端导出的列名不一致，统一归一到内部字段
const HEADER_ALIASES = {
  title: ['title', 'name', '标题', '任务标题', '任务名称'],
  listName: ['listname', 'list', '清单', '清单名称', '列表', '列表名称'],
  folderName: ['foldername', 'folder', '文件夹', '分组', '文件夹名称'],
  content: ['content', 'description', 'desc', 'notes', '内容', '描述', '备注'],
  status: ['status', '状态', '是否完成', '完成状态'],
  completedAt: ['completedtime', 'completedat', 'completeddate', '完成时间', '完成日期'],
  dueAt: ['duedate', 'due', 'deadline', '截止日期', '截止时间', '到期时间'],
  startAt: ['startdate', 'start', 'startat', '开始日期', '开始时间'],
  priority: ['priority', '优先级'],
  tags: ['tags', 'tag', '标签'],
  allDay: ['isallday', 'allday', '全天', '是否全天'],
  order: ['order', 'sortorder', 'sort', '排序'],
  kind: ['kind', 'type', '类型'],
  repeat: ['recurring', 'repeat', 'repeatflag', '重复', '重复规则'],
  reminder: ['reminder', 'reminders', '提醒'],
  id: ['id', 'taskid', '任务id'],
  parentId: ['parentid', 'parent', '父任务id', '父任务']
}

const COMPLETED_VALUES = new Set([
  '2', 'completed', 'complete', 'done', 'true', 'yes', '已完成', '完成', 'closed'
])

// 把表头统一成小写、去掉空白和常见分隔符，便于匹配中英文别名
const normalizeHeader = (value) => String(value ?? '')
  .replace(/^\uFEFF/, '')
  .trim()
  .toLowerCase()
  .replace(/[\s_\-()（）]/g, '')

// 列名别名 → 内部字段，后出现的同义列不会覆盖先出现的列
const HEADER_FIELD = Object.entries(HEADER_ALIASES).reduce((map, [field, aliases]) => {
  aliases.forEach((alias) => {
    const key = normalizeHeader(alias)
    if (!map[key]) map[key] = field
  })
  return map
}, {})

// RFC 4180 风格的 CSV 解析：支持引号包裹的逗号、换行与转义引号
export function parseCsv(text) {
  const source = String(text ?? '').replace(/^\uFEFF/, '')
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]

    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      // 兼容 CRLF，避免产生多余空行
      if (char === '\r' && source[i + 1] === '\n') i += 1
      row.push(field)
      field = ''
      if (row.some((value) => value !== '')) rows.push(row)
      row = []
    } else {
      field += char
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.some((value) => value !== '')) rows.push(row)
  }

  return rows
}

// 解析日期：兼容 TickTick 的 +0800 时区写法；全天任务落到当天 23:59，避免一过零点就显示逾期
export function parseTickTickDate(value, { allDay = false } = {}) {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  if (allDay) {
    const dateMatch = raw.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
    if (dateMatch) {
      return new Date(
        Number(dateMatch[1]),
        Number(dateMatch[2]) - 1,
        Number(dateMatch[3]),
        23, 59, 59, 999
      ).toISOString()
    }
  }

  // JS 对 +0800 的兼容性不稳定，先补上冒号
  const normalized = raw
    .replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
    .replace(' ', 'T')

  let date = new Date(normalized)
  if (Number.isNaN(date.getTime())) {
    const dateMatch = raw.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
    if (dateMatch) {
      date = new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]))
    }
  }

  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

// 把滴答清单的优先级转成可读标签；滴答没有对应字段，只能写进备注
const priorityLabel = (value) => {
  const raw = String(value ?? '').trim()
  const normalized = raw.toLowerCase()
  if (!raw || normalized === '0' || normalized === 'none') return ''
  if (['5', 'high', '高', '紧急'].includes(normalized)) return '高'
  if (['3', 'medium', '中', '普通'].includes(normalized)) return '中'
  if (['1', 'low', '低'].includes(normalized)) return '低'
  return raw
}

const isTruthy = (value) => ['1', 'true', 'yes', 'y', '是'].includes(String(value ?? '').trim().toLowerCase())

// 判断完成状态：有完成时间一定算完成，否则看状态列；导出里常见 2 / Completed / 已完成
const isCompleted = (status, completedAt) => {
  if (completedAt) return true
  return COMPLETED_VALUES.has(String(status ?? '').trim().toLowerCase())
}

const splitTags = (value) => {
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag).trim()).filter(Boolean)
  }
  return String(value ?? '')
    .split(/[,，、;；]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
}

const pad = (value) => String(value).padStart(2, '0')

// 备注里展示本地时间，避免用户看到 UTC 的 ISO 字符串
const formatLocal = (iso) => {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// 把原始描述与无法落库的元信息合成 Markdown 备注，保证导入后信息不丢
const composeDetails = (content, meta = {}) => {
  const parts = []
  const text = String(content ?? '').trim()
  if (text) parts.push(text)

  const bits = []
  if (meta.desc) bits.push(`副标题：${meta.desc}`)
  if (meta.listName) bits.push(`清单：${meta.listName}`)
  if (meta.folderName && meta.folderName !== meta.listName) bits.push(`文件夹：${meta.folderName}`)
  if (meta.priority) bits.push(`优先级：${meta.priority}`)
  if (meta.kind) bits.push(`类型：${meta.kind}`)
  if (meta.tags?.length) bits.push(`标签：${meta.tags.join('、')}`)
  if (meta.startAt) bits.push(`开始：${formatLocal(meta.startAt)}`)
  if (meta.repeat) bits.push(`重复：${meta.repeat}`)
  if (meta.reminder) bits.push(`提醒：${meta.reminder}`)
  if (meta.extra) bits.push(meta.extra)
  if (bits.length) parts.push(`> 滴答清单｜${bits.join('｜')}`)

  return parts.length ? parts.join('\n\n') : null
}

// 重复规则只在 repeatFlag 存在时成立；repeatFrom 单独出现是滴答的残留标记，不单独展示
const composeRepeat = (flag, from) => {
  const rule = String(flag ?? '').trim()
  if (!rule) return ''
  const origin = String(from ?? '').trim()
  return origin ? `${rule}（起点 ${origin}）` : rule
}

// 来源标识按类型加前缀，避免任务 ID 与检查项 ID 撞车
const externalIdOf = (prefix, value) => {
  const id = String(value ?? '').trim()
  return id ? `${prefix}${id}` : null
}

// 解析 CSV 导出：滴答官方 CSV 是扁平的，没有父子关系，所有任务按清单归组
export function parseTickTickCsv(text, { now = new Date() } = {}) {
  const rows = parseCsv(text)
  if (rows.length === 0) throw new Error('文件为空')

  const headers = rows[0].map(normalizeHeader)
  const headerIndex = {}
  headers.forEach((header, index) => {
    const field = HEADER_FIELD[header]
    if (field && headerIndex[field] === undefined) headerIndex[field] = index
  })

  if (headerIndex.title === undefined) {
    throw new Error('没有找到标题列，请确认这是滴答清单导出的 CSV')
  }

  const warnings = []
  const tasks = []
  let skipped = 0

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    const get = (field) => {
      const index = headerIndex[field]
      return index === undefined ? '' : String(row[index] ?? '').trim()
    }

    const title = get('title')
    if (!title) {
      skipped += 1
      continue
    }

    const allDay = isTruthy(get('allDay'))
    const dueAt = parseTickTickDate(get('dueAt'), { allDay })
    const startAt = parseTickTickDate(get('startAt'))
    const completedAt = parseTickTickDate(get('completedAt'))
    const completed = isCompleted(get('status'), completedAt)
    const listName = get('listName') || get('folderName') || null
    const folderName = get('folderName') || null
    const tags = splitTags(get('tags'))
    const sortOrderValue = Number.parseInt(get('order'), 10)

    tasks.push({
      key: `csv:${rowIndex}`,
      parentKey: null,
      // CSV 没有稳定任务 ID，不参与去重
      externalId: null,
      title,
      details: composeDetails(get('content'), {
        listName,
        folderName,
        priority: priorityLabel(get('priority')),
        tags,
        startAt,
        repeat: get('repeat'),
        reminder: get('reminder')
      }),
      deadline: dueAt,
      completedAt: completed ? (completedAt || now.toISOString()) : null,
      listName,
      folderName,
      sortOrder: Number.isFinite(sortOrderValue) ? sortOrderValue : rowIndex - 1
    })
  }

  if (skipped > 0) warnings.push(`跳过 ${skipped} 行没有标题的记录`)
  if (tasks.length === 0) throw new Error('没有解析到可导入的任务')

  return { format: 'csv', tasks, warnings }
}

// 解析 JSON：既支持滴答 OpenAPI 返回的任务数组，也兼容带 tasks/projects 的备份结构
export function parseTickTickJson(text, { now = new Date() } = {}) {
  let root
  try {
    root = JSON.parse(String(text ?? ''))
  } catch (err) {
    throw new Error('JSON 解析失败，请确认文件没有损坏')
  }

  const rawTasks = Array.isArray(root)
    ? root
    : (Array.isArray(root?.tasks) ? root.tasks : (Array.isArray(root?.data) ? root.data : null))
  if (!rawTasks) throw new Error('JSON 中没有找到任务数组')

  const warnings = []
  const projectNames = new Map()
  const projects = Array.isArray(root?.projects) ? root.projects : []
  projects.forEach((project) => {
    if (project?.id) projectNames.set(String(project.id), project.name || '')
  })

  // 有些备份只给 childIds，没有 parentId，这里反推一次父子关系
  const parentByChild = new Map()
  rawTasks.forEach((task) => {
    const id = task?.id ?? task?.taskId
    const childIds = task?.childIds ?? task?.child_ids
    if (id && Array.isArray(childIds)) {
      childIds.forEach((childId) => parentByChild.set(String(childId), String(id)))
    }
  })

  const tasks = []
  const usedKeys = new Set()

  rawTasks.forEach((task, index) => {
    if (!task || typeof task !== 'object') return
    const title = String(task.title ?? task.name ?? '').trim()
    if (!title) return

    const rawId = task.id ?? task.taskId
    const baseKey = rawId ? `json:${rawId}` : `json:${index}`
    const key = usedKeys.has(baseKey) ? `${baseKey}#${index}` : baseKey
    usedKeys.add(key)

    const projectId = task.projectId ?? task.project_id
    const listName = task.projectName
      || (projectId ? projectNames.get(String(projectId)) : '')
      || task.listName
      || null
    const folderName = task.folderName || task.groupName || null
    const completedAt = parseTickTickDate(task.completedTime ?? task.completedAt)
    const completed = isCompleted(task.status, completedAt)
    const parentRaw = task.parentId ?? task.parent_id ?? (rawId ? parentByChild.get(String(rawId)) : null)
    const parentKey = parentRaw ? `json:${parentRaw}` : null

    const tags = splitTags(task.tags)
    const priority = priorityLabel(task.priority)
    const repeat = composeRepeat(task.repeatFlag ?? task.repeat, task.repeatFrom)
    const reminders = Array.isArray(task.reminders) ? task.reminders.join('、') : (task.reminders || '')
    const allDay = isTruthy(task.isAllDay ?? task.allDay)
    const deadline = parseTickTickDate(task.dueDate ?? task.due ?? task.deadline, { allDay })
    const startAt = parseTickTickDate(task.startDate ?? task.startAt ?? task.start)
    const kind = String(task.kind ?? '').trim()

    tasks.push({
      key,
      parentKey,
      externalId: externalIdOf('ticktick:', rawId),
      title,
      details: composeDetails(task.content || task.description || task.notes, {
        desc: String(task.desc ?? '').trim(),
        listName,
        folderName,
        priority,
        // TEXT 是普通任务的默认类型，只有笔记/清单才值得标注
        kind: kind && kind.toUpperCase() !== 'TEXT' ? kind : '',
        tags,
        startAt,
        repeat,
        reminder: reminders
      }),
      deadline,
      completedAt: completed ? (completedAt || now.toISOString()) : null,
      listName,
      folderName,
      sortOrder: Number.isFinite(Number(task.sortOrder ?? task.order)) ? Number(task.sortOrder ?? task.order) : index
    })

    // 检查项作为子任务保留，完成状态与时间一并迁移
    if (Array.isArray(task.items)) {
      task.items.forEach((item, itemIndex) => {
        const itemTitle = String(item?.title ?? item?.name ?? '').trim()
        if (!itemTitle) return
        const itemCompletedAt = parseTickTickDate(item?.completedTime ?? item?.completedAt)
        const itemCompleted = item?.status === 1 || isCompleted(item?.status, itemCompletedAt)
        const itemAllDay = isTruthy(item?.isAllDay)
        tasks.push({
          key: `${key}:item:${itemIndex}`,
          parentKey: key,
          externalId: externalIdOf('ticktick:item:', item?.id),
          title: itemTitle,
          details: composeDetails(item?.content ?? item?.desc, {
            extra: '检查项',
            startAt: parseTickTickDate(item?.startDate ?? item?.startAt, { allDay: itemAllDay })
          }),
          deadline: parseTickTickDate(item?.dueDate ?? item?.due, { allDay: itemAllDay }),
          completedAt: itemCompleted ? (itemCompletedAt || now.toISOString()) : null,
          listName,
          folderName,
          sortOrder: itemIndex
        })
      })
    }
  })

  if (tasks.length === 0) throw new Error('没有解析到可导入的任务')
  return { format: 'json', tasks, warnings }
}

// 按文件内容选择解析器：扩展名优先，其次看首个非空字符
export function parseTickTickFile(name, text, options = {}) {
  const lowerName = String(name ?? '').toLowerCase()
  const trimmed = String(text ?? '').trimStart()
  const looksJson = trimmed.startsWith('{') || trimmed.startsWith('[')
  if (lowerName.endsWith('.json') || (!lowerName.endsWith('.csv') && looksJson)) {
    return parseTickTickJson(text, options)
  }
  return parseTickTickCsv(text, options)
}

// 汇总预览信息：任务数、清单数与已完成数
export function summarizeTickTickTasks(tasks = []) {
  const listNames = new Set()
  let completed = 0
  tasks.forEach((task) => {
    if (task.listName) listNames.add(task.listName)
    if (task.completedAt) completed += 1
  })
  return { taskCount: tasks.length, listCount: listNames.size, completedCount: completed }
}

// 生成写入计划：父任务一定排在子任务之前，清单分组节点排在最前
export function buildImportPlan(tasks = [], { groupByList = true } = {}) {
  const warnings = []
  const taskByKey = new Map()
  const indexByKey = new Map()

  tasks.forEach((task, index) => {
    if (!task?.title) return
    let key = String(task.key ?? `task:${index}`)
    if (taskByKey.has(key)) {
      warnings.push(`任务「${task.title}」的标识重复，已自动改名`)
      key = `${key}#${index}`
    }
    taskByKey.set(key, { ...task, key })
    indexByKey.set(key, index)
  })

  const listNames = []
  const listKeyByName = new Map()
  if (groupByList) {
    taskByKey.forEach((task) => {
      if (!task.listName || listKeyByName.has(task.listName)) return
      listKeyByName.set(task.listName, `list:${task.listName}`)
      listNames.push(task.listName)
    })
  }

  const childrenByParent = new Map()
  const roots = []

  taskByKey.forEach((task) => {
    let parentKey = task.parentKey || null
    if (parentKey && !taskByKey.has(parentKey)) {
      warnings.push(`任务「${task.title}」的父任务不在文件中，已作为顶层任务`)
      parentKey = null
    }
    if (parentKey === task.key) {
      warnings.push(`任务「${task.title}」的父任务指向自己，已作为顶层任务`)
      parentKey = null
    }
    if (!parentKey) {
      roots.push(task)
      return
    }
    if (!childrenByParent.has(parentKey)) childrenByParent.set(parentKey, [])
    childrenByParent.get(parentKey).push(task)
  })

  const sortSiblings = (list) => list.sort((a, b) => {
    const aOrder = Number.isFinite(a.sortOrder) ? a.sortOrder : Number.POSITIVE_INFINITY
    const bOrder = Number.isFinite(b.sortOrder) ? b.sortOrder : Number.POSITIVE_INFINITY
    if (aOrder !== bOrder) return aOrder - bOrder
    return (indexByKey.get(a.key) ?? 0) - (indexByKey.get(b.key) ?? 0)
  })
  sortSiblings(roots)
  childrenByParent.forEach(sortSiblings)

  const nodes = []
  const visited = new Set()

  const emit = (task, parentKey, sortOrder, path) => {
    if (visited.has(task.key)) return
    if (path.has(task.key)) {
      warnings.push(`检测到循环引用：${task.title}，已跳过重复分支`)
      return
    }
    visited.add(task.key)
    nodes.push({
      key: task.key,
      parentKey,
      externalId: task.externalId ?? null,
      title: task.title,
      details: task.details ?? null,
      deadline: task.deadline ?? null,
      completedAt: task.completedAt ?? null,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : null
    })

    const nextPath = new Set(path)
    nextPath.add(task.key)
    const children = childrenByParent.get(task.key) || []
    children.forEach((child, index) => {
      emit(child, task.key, index, nextPath)
    })
  }

  // 先建清单分组节点，再把该清单下的顶层任务挂进去
  if (groupByList) {
    listNames.forEach((name, index) => {
      const key = listKeyByName.get(name)
      nodes.push({
        key,
        parentKey: null,
        externalId: `ticktick:list:${name}`,
        title: name,
        details: null,
        deadline: null,
        completedAt: null,
        sortOrder: index,
        isList: true
      })
      roots
        .filter((task) => task.listName === name)
        .forEach((task, taskIndex) => {
          emit(task, key, taskIndex, new Set([key]))
        })
    })
  }

  const remainingRoots = groupByList
    ? roots.filter((task) => !task.listName || !listKeyByName.has(task.listName))
    : roots
  remainingRoots.forEach((task, index) => {
    emit(task, null, index, new Set())
  })

  // 纯循环里没有顶层节点，兜底提升为顶层，保证所有任务都能导入
  taskByKey.forEach((task) => {
    if (visited.has(task.key)) return
    warnings.push(`任务「${task.title}」存在循环引用，已提升为顶层任务`)
    emit(task, null, nodes.length, new Set())
  })

  return { nodes, warnings }
}

// 读取已导入过的记录，用于重复导入时命中同一行
const fetchImportedRecords = async (supabase) => {
  const byExternalId = new Map()
  if (typeof supabase?.from !== 'function') return byExternalId

  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('todos')
      .select('id, external_id, title, details, deadline, completed_at, deleted_at')
      .not('external_id', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw error
    if (!Array.isArray(data) || data.length === 0) break
    data.forEach((row) => byExternalId.set(row.external_id, row))
    if (data.length < pageSize) break
  }
  return byExternalId
}

const sameInstant = (left, right) => {
  if (!left && !right) return true
  if (!left || !right) return false
  return new Date(left).getTime() === new Date(right).getTime()
}

// 只把与库里不同的字段挑出来，重复导入不会产生无意义的写入
const diffExisting = (row, node) => {
  const patch = {}
  if ((row.title ?? '') !== node.title) patch.title = node.title
  if ((row.details ?? null) !== (node.details ?? null)) patch.details = node.details ?? null
  if (!sameInstant(row.deadline, node.deadline)) patch.deadline = node.deadline ?? null
  if (!sameInstant(row.completed_at, node.completedAt)) patch.completed_at = node.completedAt ?? null
  return patch
}

// 顺序执行导入计划：父子依赖决定不能并发，逐条调用 create_todo 并记录真实 ID
export async function executeTickTickImport({ supabase, nodes = [], onProgress, isCancelled } = {}) {
  if (!supabase) throw new Error('缺少 Supabase 客户端')

  const existingByExternalId = await fetchImportedRecords(supabase)
  const idByKey = new Map()
  const failedKeys = new Set()
  const errors = []
  let imported = 0
  let updated = 0
  let unchanged = 0
  let failed = 0
  let skipped = 0
  let cancelled = false

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]

    if (isCancelled?.()) {
      cancelled = true
      break
    }

    let parentId = null
    if (node.parentKey) {
      if (failedKeys.has(node.parentKey) || !idByKey.has(node.parentKey)) {
        skipped += 1
        failedKeys.add(node.key)
        errors.push({ title: node.title, message: '父任务未创建成功，已跳过' })
        onProgress?.(index + 1, nodes.length, node.title)
        continue
      }
      parentId = idByKey.get(node.parentKey)
    }

    // 命中已导入过的任务：沿用原记录，只同步变化的字段
    const existing = node.externalId ? existingByExternalId.get(node.externalId) : null
    if (existing) {
      if (existing.deleted_at) {
        skipped += 1
        failedKeys.add(node.key)
        errors.push({ title: node.title, message: '任务已在回收站中，已跳过' })
        onProgress?.(index + 1, nodes.length, node.title)
        continue
      }

      const patch = diffExisting(existing, node)
      if (Object.keys(patch).length === 0) {
        idByKey.set(node.key, existing.id)
        unchanged += 1
        onProgress?.(index + 1, nodes.length, node.title)
        continue
      }

      const { error } = await supabase
        .from('todos')
        .update(patch)
        .eq('id', existing.id)

      if (error) {
        failed += 1
        failedKeys.add(node.key)
        errors.push({ title: node.title, message: error.message || '更新失败' })
      } else {
        idByKey.set(node.key, existing.id)
        updated += 1
      }

      onProgress?.(index + 1, nodes.length, node.title)
      continue
    }

    const { data, error } = await supabase.rpc('create_todo', {
      p_title: node.title,
      p_details: node.details ?? null,
      p_deadline: node.deadline ?? null,
      p_sort_order: node.sortOrder ?? null,
      p_difficulty: null,
      p_completed_at: node.completedAt ?? null,
      p_parent_id: parentId,
      p_external_id: node.externalId ?? null
    })

    if (error) {
      failed += 1
      failedKeys.add(node.key)
      errors.push({ title: node.title, message: error.message || '创建失败' })
    } else if (!data?.id) {
      failed += 1
      failedKeys.add(node.key)
      errors.push({ title: node.title, message: '服务器未返回任务 ID' })
    } else {
      imported += 1
      idByKey.set(node.key, data.id)
    }

    onProgress?.(index + 1, nodes.length, node.title)
  }

  return { imported, updated, unchanged, failed, skipped, errors, cancelled }
}
