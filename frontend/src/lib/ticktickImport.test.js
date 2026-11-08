import { describe, it, expect, vi } from 'vitest'
import {
  parseCsv,
  parseTickTickCsv,
  parseTickTickJson,
  parseTickTickFile,
  buildImportPlan,
  executeTickTickImport
} from './ticktickImport'

const localTime = (year, month, day, hour, minute, second = 0, ms = 0) =>
  new Date(year, month - 1, day, hour, minute, second, ms).toISOString()

describe('parseCsv', () => {
  it('支持引号内的逗号、换行与转义引号', () => {
    const rows = parseCsv('a,b\r\n"x,1","line1\nline2"\r\n"he said ""hi""",2')
    expect(rows).toEqual([
      ['a', 'b'],
      ['x,1', 'line1\nline2'],
      ['he said "hi"', '2']
    ])
  })
})

describe('parseTickTickCsv', () => {
  it('解析英文表头并把无法落库的字段写进备注', () => {
    const csv = [
      'Title,List Name,Content,Due Date,Status,Priority,Tags,Is All Day,Order',
      '"写周报","工作","第一行\n第二行, 含逗号","2026-11-10T09:00:00+0800",0,5,"重要,紧急",N,0',
      '"已做完","工作","",,2,,,,1'
    ].join('\n')

    const { tasks, format } = parseTickTickCsv(csv, { now: new Date('2026-11-08T00:00:00Z') })
    expect(format).toBe('csv')
    expect(tasks).toHaveLength(2)

    expect(tasks[0]).toMatchObject({
      title: '写周报',
      listName: '工作',
      deadline: '2026-11-10T01:00:00.000Z',
      completedAt: null,
      sortOrder: 0
    })
    expect(tasks[0].details).toContain('第一行\n第二行, 含逗号')
    expect(tasks[0].details).toContain('清单：工作')
    expect(tasks[0].details).toContain('优先级：高')
    expect(tasks[0].details).toContain('标签：重要、紧急')

    expect(tasks[1].completedAt).toBe('2026-11-08T00:00:00.000Z')
  })

  it('兼容中文表头，全天任务落到当天 23:59', () => {
    const csv = [
      '标题,清单,到期时间,是否全天,状态',
      '整理桌面,生活,2026-11-12,是,已完成'
    ].join('\n')

    const { tasks } = parseTickTickCsv(csv)
    expect(tasks[0].title).toBe('整理桌面')
    expect(tasks[0].listName).toBe('生活')
    expect(tasks[0].deadline).toBe(localTime(2026, 11, 12, 23, 59, 59, 999))
    expect(tasks[0].completedAt).not.toBeNull()
  })

  it('没有标题列时给出明确错误', () => {
    expect(() => parseTickTickCsv('清单,内容\n工作,abc')).toThrow('没有找到标题列')
  })
})

describe('parseTickTickJson', () => {
  it('保留父子关系并把检查项转成子任务', () => {
    const json = JSON.stringify({
      projects: [{ id: 'p1', name: '工作' }],
      tasks: [
        { id: 't1', projectId: 'p1', title: '上线准备', content: '说明', priority: 5, tags: ['发布'] },
        { id: 't2', projectId: 'p1', title: '检查清单', parentId: 't1', status: 2, completedTime: '2026-11-01T10:00:00+0800' },
        {
          id: 't3',
          projectId: 'p1',
          title: '发布',
          items: [
            { title: '跑测试', status: 1, completedTime: '2026-11-02T10:00:00+0800' },
            { title: '写公告', status: 0 }
          ]
        }
      ]
    })

    const { tasks } = parseTickTickJson(json, { now: new Date('2026-11-08T00:00:00Z') })
    expect(tasks).toHaveLength(5)
    expect(tasks[0]).toMatchObject({ key: 'json:t1', listName: '工作', parentKey: null })
    expect(tasks[1]).toMatchObject({ key: 'json:t2', parentKey: 'json:t1' })
    expect(tasks[1].completedAt).not.toBeNull()

    const itemTasks = tasks.filter((task) => task.parentKey === 'json:t3')
    expect(itemTasks).toHaveLength(2)
    expect(itemTasks[0]).toMatchObject({ title: '跑测试' })
    expect(itemTasks[0].completedAt).not.toBeNull()
    expect(itemTasks[1].completedAt).toBeNull()
  })

  it('只有 childIds 时也能反推父任务', () => {
    const json = JSON.stringify([
      { id: 'a', title: '父', childIds: ['b'] },
      { id: 'b', title: '子' }
    ])
    const { tasks } = parseTickTickJson(json)
    expect(tasks[1].parentKey).toBe('json:a')
  })
})

describe('parseTickTickFile', () => {
  it('按扩展名或首字符选择解析器', () => {
    expect(parseTickTickFile('backup.json', '{"tasks":[{"id":"1","title":"a"}]}').format).toBe('json')
    expect(parseTickTickFile('backup.csv', '标题\n任务').format).toBe('csv')
    expect(parseTickTickFile('unknown', '[{"id":"1","title":"a"}]').format).toBe('json')
  })
})

describe('buildImportPlan', () => {
  it('按清单分组并把父任务排在子任务之前', () => {
    const tasks = [
      { key: 'child', parentKey: 'parent', title: '子任务', listName: '工作', sortOrder: 0 },
      { key: 'parent', parentKey: null, title: '父任务', listName: '工作', sortOrder: 1 },
      { key: 'other', parentKey: null, title: '生活任务', listName: '生活', sortOrder: 0 },
      { key: 'top', parentKey: null, title: '收件箱任务', listName: null, sortOrder: 0 }
    ]

    const { nodes, warnings } = buildImportPlan(tasks, { groupByList: true })
    expect(warnings).toHaveLength(0)
    expect(nodes.map((node) => node.key)).toEqual([
      'list:工作',
      'parent',
      'child',
      'list:生活',
      'other',
      'top'
    ])
    expect(nodes.find((node) => node.key === 'child').parentKey).toBe('parent')
    expect(nodes.find((node) => node.key === 'other').parentKey).toBe('list:生活')
    expect(nodes.find((node) => node.key === 'top').parentKey).toBeNull()
  })

  it('循环引用不会无限递归', () => {
    const tasks = [
      { key: 'a', parentKey: 'b', title: 'A', listName: null },
      { key: 'b', parentKey: 'a', title: 'B', listName: null }
    ]
    const { nodes, warnings } = buildImportPlan(tasks, { groupByList: false })
    expect(nodes).toHaveLength(2)
    expect(warnings.some((warning) => warning.includes('循环引用'))).toBe(true)
  })

  it('父任务缺失时提升为顶层任务', () => {
    const tasks = [{ key: 'a', parentKey: 'missing', title: '孤儿', listName: null }]
    const { nodes, warnings } = buildImportPlan(tasks, { groupByList: false })
    expect(nodes[0].parentKey).toBeNull()
    expect(warnings[0]).toContain('父任务不在文件中')
  })
})

describe('executeTickTickImport', () => {
  it('按计划顺序写入，并把真实父 ID 传给子任务', async () => {
    const rpc = vi.fn(async (name, params) => {
      expect(name).toBe('create_todo')
      return { data: { id: params.p_parent_id ? 102 : 101 }, error: null }
    })
    const nodes = [
      { key: 'parent', parentKey: null, title: '父', details: null, deadline: null, completedAt: null, sortOrder: 0 },
      { key: 'child', parentKey: 'parent', title: '子', details: '备注', deadline: null, completedAt: null, sortOrder: 0 }
    ]

    const progress = []
    const result = await executeTickTickImport({
      supabase: { rpc },
      nodes,
      onProgress: (done, total) => progress.push([done, total])
    })

    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc.mock.calls[1][1].p_parent_id).toBe(101)
    expect(result).toMatchObject({ imported: 2, failed: 0, skipped: 0, cancelled: false })
    expect(progress).toEqual([[1, 2], [2, 2]])
  })

  it('父任务失败时跳过子任务而不是继续挂载', async () => {
    const rpc = vi.fn(async (_name, params) => {
      if (params.p_title === '父') return { data: null, error: { message: 'boom' } }
      return { data: { id: 1 }, error: null }
    })
    const nodes = [
      { key: 'parent', parentKey: null, title: '父', sortOrder: 0 },
      { key: 'child', parentKey: 'parent', title: '子', sortOrder: 0 }
    ]

    const result = await executeTickTickImport({ supabase: { rpc }, nodes })
    expect(result).toMatchObject({ imported: 0, failed: 1, skipped: 1 })
    expect(result.errors.map((item) => item.title)).toEqual(['父', '子'])
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('取消后不再继续写入', async () => {
    let calls = 0
    const rpc = vi.fn(async () => {
      calls += 1
      return { data: { id: calls }, error: null }
    })
    const nodes = [
      { key: 'a', parentKey: null, title: 'A', sortOrder: 0 },
      { key: 'b', parentKey: null, title: 'B', sortOrder: 1 }
    ]
    const result = await executeTickTickImport({
      supabase: { rpc },
      nodes,
      isCancelled: () => calls >= 1
    })
    expect(result.cancelled).toBe(true)
    expect(result.imported).toBe(1)
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})
