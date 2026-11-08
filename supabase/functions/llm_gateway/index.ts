// 内置模型网关：用平台密钥代理 OpenAI 兼容请求，订阅与额度校验留作后续接入
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";

// 每个请求都先确认已登录，再用用户身份检查订阅与额度
interface AuthorizationResult {
  ok: boolean;
  status?: number;
  code?: string;
  error?: string;
}

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const readEnvList = (name: string) =>
  (Deno.env.get(name) ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

// 订阅校验钩子：接入计费后在这里查询 subscriptions、usage_counters 与套餐模型白名单
// 返回 { ok: false, status: 402 | 429, error } 即可拒绝请求
async function authorizeRequest(_userId: string, _model: string): Promise<AuthorizationResult> {
  return { ok: true };
}

async function handler(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // 优先用 LLM_*；未配置时复用既有 AI 函数使用的 DeepSeek 密钥，便于直接联调
  const platformKey = Deno.env.get("LLM_API_KEY");
  const deepseekKey = Deno.env.get("DEEPSEEK_API_KEY");
  const apiKey = platformKey || deepseekKey;
  if (!apiKey) {
    return jsonResponse({ error: "网关未配置 LLM_API_KEY" }, 500);
  }
  const explicitBaseUrl = Deno.env.get("LLM_BASE_URL") || Deno.env.get("DEEPSEEK_BASE_URL");
  const baseUrl = (
    explicitBaseUrl || (platformKey ? "https://api.openai.com/v1" : "https://api.deepseek.com")
  ).replace(/\/+$/, "");

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "缺少登录凭证" }, 401);
  }

  // 用用户自己的 JWT 解析身份，网关本身不保存任何用户会话
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData?.user;
  if (authError || !user) {
    return jsonResponse({ error: "登录会话已失效" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "请求体不是合法 JSON" }, 400);
  }

  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!model) {
    return jsonResponse({ error: "缺少 model" }, 400);
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonResponse({ error: "缺少 messages" }, 400);
  }

  // 白名单为空表示不限制；生产环境应显式配置，避免低价套餐调用高价模型
  const allowedModels = readEnvList("LLM_ALLOWED_MODELS");
  if (allowedModels.length > 0 && !allowedModels.includes(model)) {
    return jsonResponse({ error: `模型 ${model} 不在允许列表` }, 403);
  }

  const gate = await authorizeRequest(user.id, model);
  if (!gate.ok) {
    return jsonResponse({ error: gate.error || "当前套餐不可用", code: gate.code }, gate.status ?? 403);
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: `无法连接模型服务：${message}` }, 502);
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return new Response(detail || JSON.stringify({ error: "模型服务调用失败" }), {
      status: upstream.status,
      headers: {
        ...corsHeaders,
        "Content-Type": upstream.headers.get("content-type") || "application/json",
      },
    });
  }

  // TODO(订阅): 计费接入后解析 usage（流式需 include_usage）并写回 usage_counters
  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": upstream.headers.get("content-type") || "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}

Deno.serve(handler);
