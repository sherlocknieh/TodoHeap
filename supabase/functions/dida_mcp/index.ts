// 滴答清单 MCP 网关：代理 OAuth 注册/换 token 与 MCP 调用
// 浏览器无法直连 mcp.dida365.com（预检被拒），因此由网关代为转发；访问令牌只在请求内存中传递
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";

const MCP_ENDPOINT = "https://mcp.dida365.com/";
const REGISTER_ENDPOINT = "https://api.dida365.com/oauth/register";
const TOKEN_ENDPOINT = "https://api.dida365.com/oauth/token";
const MCP_PROTOCOL_VERSION = "2025-06-18";
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

// MCP 可能用普通 JSON 或 SSE 返回，取出最后一条完整消息
const readMcpPayload = (contentType: string, text: string) => {
  if (!contentType.includes("event-stream")) {
    return text ? JSON.parse(text) : null;
  }

  let payload: unknown = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      payload = JSON.parse(data);
    } catch {
      // 跨行分片会在后续 data 行补全，跳过当前不完整片段
    }
  }
  return payload;
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

// 透传 JSON-RPC 调用；上游若下发会话头，后续请求原样带回
const handleRpc = async (body: Record<string, unknown>) => {
  const accessToken = String(body.accessToken ?? "").trim();
  const sessionId = String(body.sessionId ?? "").trim();
  const rpc = body.rpc;
  if (!accessToken) return jsonResponse({ error: "缺少滴答清单访问令牌" }, 400);
  if (!rpc || typeof rpc !== "object") return jsonResponse({ error: "缺少 MCP 请求体" }, 400);

  const upstream = await fetch(MCP_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${accessToken}`,
      "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
    },
    body: JSON.stringify(rpc),
  });

  if (!upstream.ok) {
    const unauthorized = upstream.status === 401;
    return jsonResponse({
      error: unauthorized
        ? "滴答清单授权已失效，请重新连接"
        : `滴答清单调用失败：${await readUpstreamError(upstream)}`,
      unauthorized,
    }, unauthorized ? 401 : 502);
  }

  const text = await upstream.text();
  try {
    return jsonResponse({
      payload: readMcpPayload(upstream.headers.get("content-type") ?? "", text),
      sessionId: upstream.headers.get("mcp-session-id") ?? undefined,
    });
  } catch {
    return jsonResponse({ error: "滴答清单返回了无法解析的响应" }, 502);
  }
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
      case "rpc":
        return await handleRpc(body);
      default:
        return jsonResponse({ error: "未知操作" }, 400);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: `无法连接滴答清单：${message}` }, 502);
  }
}

Deno.serve(handler);
