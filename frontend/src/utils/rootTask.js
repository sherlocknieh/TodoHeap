// 根任务是每个用户一条的系统任务: 顶层任务挂在它的 child_ids 下, 自身不参与
// 普通任务出口(列表/统计/回收站/Agent/导入)。这里给出唯一判定入口, 调用处不要重复写 is_root。
export const ROOT_TODO_TITLE = '全部任务'

export const isRootTodo = (todo) => Boolean(todo?.is_root)

export const findRootTodo = (todos) => (todos || []).find(isRootTodo) ?? null

// 去掉根任务后的普通任务集合，用于计数、堆视图、Agent 候选等
export const withoutRootTodos = (todos) => (todos || []).filter((todo) => !isRootTodo(todo))
