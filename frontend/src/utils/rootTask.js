// 根任务是每个用户一条的系统任务: 顶层任务挂在它的 child_ids 下, 自身不参与
// 普通任务出口(列表/统计/回收站/Agent/导入)。这里给出唯一判定入口, 调用处不要重复写 is_root。
export const ROOT_TODO_TITLE = '全部任务'

export const isRootTodo = (todo) => Boolean(todo?.is_root)

export const findRootTodo = (todos) => (todos || []).find(isRootTodo) ?? null

// 去掉根任务后的普通任务集合，用于计数、堆视图、Agent 候选等
export const withoutRootTodos = (todos) => (todos || []).filter((todo) => !isRootTodo(todo))

// 列表要展示的顶层节点：根任务的子级。
// 失去全部父链接的任务（解链、同步间隙）按顶层展示，避免从列表里消失。
export const listTreeOf = (forest) => {
  const nodes = forest || []
  const root = nodes.find(isRootTodo)
  if (!root) return nodes
  return [...(root.children || []), ...nodes.filter((node) => node !== root)]
}
