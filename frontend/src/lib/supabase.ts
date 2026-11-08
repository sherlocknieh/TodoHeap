import { createClient } from '@supabase/supabase-js'

// 获取环境变量 (来自 .env 文件)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePubKey = import.meta.env.VITE_SUPABASE_PUB_KEY

// 变量缺失时在此暴露原因, 避免 supabase-js 抛出难以定位的 "supabaseKey is required"
if (!supabaseUrl || !supabasePubKey) {
  throw new Error('缺少 Supabase 配置, 请检查 VITE_SUPABASE_URL 与 VITE_SUPABASE_PUB_KEY')
}

// 初始化 Supabase 客户端
export const supabase = createClient(supabaseUrl, supabasePubKey)
