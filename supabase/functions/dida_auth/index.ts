// 滴答清单 OAuth 代理：动态注册公开客户端与 PKCE 授权码换令牌
// MCP 调用本身走通用网关 mcp_gateway；这里只处理浏览器无法直连的滴答授权端点
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";

const REGISTER_ENDPOINT = "https://api.dida365.com/oauth/register";
const TOKEN_ENDPOINT = "https://api.dida365.com/oauth/token";
const SCOPES = "tasks:read tasks:write";

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// 用用户自己的 JWT 解析身份，网关本身不保存任何会话或第三方令牌
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

// 只读上游错误体里的说明，避免把访问令牌带进响应
const readUpstreamError = async (response: Response) => {
  const text = await response.text().catch(() => "");
  try {
    const payload = JSON.parse(text);
    return String(payload?.error_description ?? payload?.error ?? payload?.message ?? "").slice(0, 300)
      || `上游返回 ${response.status}`;
  } catch {
    return text.slice(0, 200) || `上游返回 ${response.status}`;
  }
};

// 平台应用优先：配置了 DIDA_CLIENT_ID / DIDA_CLIENT_SECRET 时用带密钥的客户端，
// 未配置时退回动态注册的公开客户端（PKCE，无密钥）
const readPlatformClient = () => {
  const clientId = Deno.env.get("DIDA_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("DIDA_CLIENT_SECRET") ?? "";
  return clientId && clientSecret ? { clientId, clientSecret } : null;
};

// 动态客户端注册：拿到公开的 client_id，供浏览器拼授权地址
const handleRegister = async (body: Record<string, unknown>) => {
  const platformClient = readPlatformClient();
  if (platformClient) {
    return jsonResponse({ clientId: platformClient.clientId });
  }

  const redirectUri = String(body.redirectUri ?? "").trim();
  if (!/^https?:\/\/[^\s]+$/.test(redirectUri)) {
    return jsonResponse({ error: "回调地址无效" }, 400);
  }

  const upstream = await fetch(REGISTER_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_name: "TodoHeap",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: SCOPES,
    }),
  });

  if (!upstream.ok) {
    return jsonResponse({ error: `注册客户端失败：${await readUpstreamError(upstream)}` }, 502);
  }

  const payload = await upstream.json();
  if (!payload?.client_id) {
    return jsonResponse({ error: "注册客户端失败：未返回 client_id" }, 502);
  }
  return jsonResponse({ clientId: payload.client_id });
};

// 授权码换令牌：平台客户端用 Basic 鉴权，公开客户端把 client_id 放进表单
const handleToken = async (body: Record<string, unknown>) => {
  const fields: Record<string, string> = {
    grant_type: "authorization_code",
    code: String(body.code ?? ""),
    redirect_uri: String(body.redirectUri ?? ""),
    code_verifier: String(body.codeVerifier ?? ""),
  };
  if (!fields.code || !fields.redirect_uri) {
    return jsonResponse({ error: "换令牌参数不完整" }, 400);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  const platformClient = readPlatformClient();
  if (platformClient) {
    headers.Authorization = `Basic ${btoa(`${platformClient.clientId}:${platformClient.clientSecret}`)}`;
  } else {
    fields.client_id = String(body.clientId ?? "");
    if (!fields.client_id || !fields.code_verifier) {
      return jsonResponse({ error: "换令牌参数不完整" }, 400);
    }
  }

  const upstream = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers,
    body: new URLSearchParams(fields),
  });

  if (!upstream.ok) {
    return jsonResponse({ error: `授权失败：${await readUpstreamError(upstream)}` }, 400);
  }

  const payload = await upstream.json();
  if (!payload?.access_token) {
    return jsonResponse({ error: "授权失败：未返回访问令牌" }, 502);
  }
  return jsonResponse({
    accessToken: payload.access_token,
    expiresIn: Number(payload.expires_in) || 0,
    scope: String(payload.scope ?? SCOPES),
  });
};

async function handler(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const auth = await authenticate(req);
  if (auth.response) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "请求体不是合法 JSON" }, 400);
  }

  try {
    switch (body.action) {
      case "register":
        return await handleRegister(body);
      case "token":
        return await handleToken(body);
      default:
        return jsonResponse({ error: "未知操作" }, 400);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: `无法连接滴答清单授权服务：${message}` }, 502);
  }
}

Deno.serve(handler);
