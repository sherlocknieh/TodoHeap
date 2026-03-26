// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts"

console.log("Hello from Functions!")

// 创建 HTTP 服务器
Deno.serve(async (req) => {
  // 解析请求体, 提取 name 字段
  const { name } = await req.json()

  // 构建响应体
  const data = {
    message: `Hello ${name}!`,
  }
  // 返回 JSON 响应
  return new Response(
    JSON.stringify(data),
    { headers: { "Content-Type": "application/json" } },
  )
})


