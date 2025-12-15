-- Active: 1765388330729@@aws-1-ap-south-1.pooler.supabase.com@6543@postgres@public

-- 查询所有待办事项
SELECT *
FROM public.todos; 

-- 查询已删除的待办事项
SELECT *
FROM public.trash_todos;

-- 查询所有叶子层待办事项
SELECT *
FROM public.leaf_todos;