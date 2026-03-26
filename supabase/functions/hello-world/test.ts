
// 测试 HTTP 服务器

// 发送 POST 请求到函数
console.log("发送 POST: { name: \"Deno\" }")
const response = await fetch("http://localhost:8000/", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Deno" }),
})

// 解析响应体
const data = await response.json()

console.log("收到响应:", data)
