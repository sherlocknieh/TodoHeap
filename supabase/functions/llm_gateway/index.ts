// 内置模型网关：用平台密钥代理 OpenAI 兼容请求，并返回实际可用的模型列表
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";

// 每个请求都先确认已登录，再用用户身份检查订阅与额度
interface AuthorizationResult {
  ok: boolean;
  status?: number;
  code?: string;
  error?: string;
}

interface PlatformConfig {
  apiKey: string;
  baseUrl: string;
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

// 平台密钥优先用 LLM_*，未配置时复用既有 AI 函数使用的 DeepSeek 密钥
const readPlatformConfig = (): PlatformConfig | null => {
  const platformKey = Deno.env.get("LLM_API_KEY");
  const apiKey = platformKey || Deno.env.get("DEEPSEEK_API_KEY");
  if (!apiKey) return null;

  const explicitBaseUrl = Deno.env.get("LLM_BASE_URL") || Deno.env.get("DEEPSEEK_BASE_URL");
  const baseUrl = (
    explicitBaseUrl || (platformKey ? "https://api.openai.com/v1" : "https://api.deepseek.com")
  ).replace(/\/+$/, "");

  return { apiKey, baseUrl };
};

// 用用户自己的 JWT 解析身份，网关本身不保存任何用户会话
const authenticate = async (req: Request) => {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { response: jsonResponse({ error: "缺少登录凭证" }, 401) };
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    return { response: jsonResponse({ error: "登录会话已失效" }, 401) };
  }
  return { user: data.user };
};

// 订阅校验钩子：接入计费后在这里查询 subscriptions、usage_counters 与套餐模型白名单
// 返回 { ok: false, status: 402 | 429, error } 即可拒绝请求
async function authorizeRequest(_userId: string, _model: string): Promise<AuthorizationResult> {
  return { ok: true };
}

interface ModelsCache {
  baseUrl: string;
  fetchedAt: number;
  models: string[];
}

const MODELS_TTL_MS = 5 * 60 * 1000;
let modelsCache: ModelsCache | null = null;

// 兼容 OpenAI 的 data[]、部分服务商的 models[] 以及纯数组三种返回
const fetchUpstreamModels = async ({ apiKey, baseUrl }: PlatformConfig) => {
  const response = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const payload = await response.json().catch(() => null);
  const list = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.models)
      ? payload.models
      : Array.isArray(payload)
        ? payload
        : [];

  return list
    .map((item: unknown) => (typeof item === "string" ? item : (item as { id?: string })?.id))
    .filter((id): id is string => Boolean(id));
};

// 优先返回平台白名单；没有白名单时查询上游，失败则让前端退回手动填写
const handleModels = async (config: PlatformConfig) => {
  const allowedModels = readEnvList("LLM_ALLOWED_MODELS");
  if (allowedModels.length > 0) {
    return jsonResponse({ models: allowedModels, source: "allowlist" });
  }

  if (modelsCache && modelsCache.baseUrl === config.baseUrl
    && Date.now() - modelsCache.fetchedAt < MODELS_TTL_MS) {
    return jsonResponse({ models: modelsCache.models, source: "upstream" });
  }

  try {
    const models = await fetchUpstreamModels(config);
    modelsCache = { baseUrl: config.baseUrl, fetchedAt: Date.now(), models };
    return jsonResponse({ models, source: "upstream" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({
      models: [],
      source: "unavailable",
      warning: `无法读取模型列表，请手动填写模型名（${message}）`,
    });
  }
};

async function handler(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await authenticate(req);
  if (auth.response) return auth.response;

  const config = readPlatformConfig();
  if (!config) {
    return jsonResponse({ error: "网关未配置 LLM_API_KEY" }, 500);
  }

  if (req.method === "GET") {
    return await handleModels(config);
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
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

  const gate = await authorizeRequest(auth.user.id, model);
  if (!gate.ok) {
    return jsonResponse({ error: gate.error || "当前套餐不可用", code: gate.code }, gate.status ?? 403);
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
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
