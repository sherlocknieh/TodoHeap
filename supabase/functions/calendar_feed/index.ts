import { createClient } from "@supabase/supabase-js";

type ScheduleRow = {
  id: number;
  title: string;
  notes: string | null;
  location: string | null;
  url: string | null;
  attendees: string[] | null;
  all_day: boolean | null;
  status: string | null;
  color: string | null;
  reminder_minutes: number[] | null;
  start_at: string;
  end_at: string;
  updated_at: string;
};

const TOKEN_PATTERN = /^[a-f0-9]{32}$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const pad = (value: number) => String(value).padStart(2, "0");

const toUtcStamp = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "T",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    "Z",
  ].join("");
};

// 全天事件按 UTC 日期输出，与前端导出的 DATE 值保持一致
const toDateStamp = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return [date.getUTCFullYear(), pad(date.getUTCMonth() + 1), pad(date.getUTCDate())].join("");
};

const escapeText = (value: unknown) =>
  String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");

const escapeParam = (value: unknown) =>
  `"${String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

// RFC 5545 要求每行不超过 75 字节，按 UTF-8 字节切分后再折行
const foldLine = (line: string) => {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const chunks: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const char of line) {
    const charBytes = encoder.encode(char).length;
    if (currentBytes + charBytes > 74) {
      chunks.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += charBytes;
  }
  chunks.push(current);
  return chunks.join("\r\n ");
};

const buildCalendar = (schedules: ScheduleRow[]) => {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TodoHeap//Calendar Feed//ZH",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:TodoHeap 日程",
    "X-WR-TIMEZONE:UTC",
    "REFRESH-INTERVAL;VALUE=DURATION:PT30M",
    "X-PUBLISHED-TTL:PT30M",
  ];

  const stamp = toUtcStamp(new Date());
  for (const schedule of schedules) {
    lines.push("BEGIN:VEVENT", `UID:todoheap-${schedule.id}@todoheap`, `DTSTAMP:${stamp}`);

    if (schedule.all_day) {
      lines.push(
        `DTSTART;VALUE=DATE:${toDateStamp(schedule.start_at)}`,
        `DTEND;VALUE=DATE:${toDateStamp(schedule.end_at)}`,
      );
    } else {
      lines.push(
        `DTSTART:${toUtcStamp(schedule.start_at)}`,
        `DTEND:${toUtcStamp(schedule.end_at)}`,
      );
    }

    lines.push(`SUMMARY:${escapeText(schedule.title || "未命名日程")}`);

    if (schedule.notes) lines.push(`DESCRIPTION:${escapeText(schedule.notes)}`);
    if (schedule.location) lines.push(`LOCATION:${escapeText(schedule.location)}`);
    if (schedule.url) lines.push(`URL:${escapeText(schedule.url)}`);
    if (schedule.status) lines.push(`STATUS:${String(schedule.status).toUpperCase()}`);
    if (schedule.color && HEX_COLOR.test(schedule.color)) lines.push(`COLOR:${schedule.color}`);

    (schedule.attendees ?? []).forEach((name, index) => {
      // 只有姓名时用稳定的 URN 作为地址，CN 保留显示名
      lines.push(
        `ATTENDEE;CN=${escapeParam(name)};ROLE=REQ-PARTICIPANT:urn:todoheap:attendee:${schedule.id}:${index}`,
      );
    });

    if (schedule.updated_at) {
      lines.push(`LAST-MODIFIED:${toUtcStamp(schedule.updated_at)}`);
    }

    for (const minutes of schedule.reminder_minutes ?? []) {
      if (!Number.isInteger(minutes) || minutes < 0) continue;
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeText(schedule.title || "日程提醒")}`,
        `TRIGGER:-PT${minutes}M`,
        "END:VALARM",
      );
    }

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
};

const textResponse = (body: string, status: number, headers: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-store",
      "X-Robots-Tag": "noindex",
      ...headers,
    },
  });

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") {
    return textResponse("Method Not Allowed", 405, { Allow: "GET" });
  }

  const token = new URL(req.url).searchParams.get("token")?.trim() ?? "";
  if (!TOKEN_PATTERN.test(token)) {
    return textResponse("Not Found", 404);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  // 只持公开密钥调用 RPC，真正的令牌校验与数据读取在 SECURITY DEFINER 函数里
  const parseKey = (name: string, fallbackName: string) => {
    const raw = Deno.env.get(name) ?? "";
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === "string") return parsed;
        const key = parsed.default ?? Object.values(parsed).find((value) => typeof value === "string");
        if (typeof key === "string") return key;
      } catch {
        // 不是 JSON 时按原始值使用
      }
    }
    return Deno.env.get(fallbackName) ?? "";
  };
  const publishableKey = parseKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  if (!supabaseUrl || !publishableKey) {
    return textResponse("Feed unavailable", 503);
  }

  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("get_calendar_feed", { feed_token: token });
  if (error) {
    console.error("calendar_feed rpc failed", error.message);
    return textResponse("Feed unavailable", 500);
  }

  const feed = data as { found?: boolean; schedules?: ScheduleRow[] } | null;
  if (!feed?.found) {
    return textResponse("Not Found", 404);
  }

  return new Response(buildCalendar(feed.schedules ?? []), {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="todoheap.ics"',
      "Cache-Control": "no-cache, no-store, max-age=0",
      "X-Robots-Tag": "noindex",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
