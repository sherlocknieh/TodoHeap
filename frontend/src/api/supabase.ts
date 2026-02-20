import { createClient } from '@supabase/supabase-js'

// 获取环境变量 (来自 .env 文件)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// 初始化 Supabase 客户端
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
