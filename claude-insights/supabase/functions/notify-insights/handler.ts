import { formatInsights, sendTelegram } from "../_shared/format.ts";

/** Called by Supabase Database Webhook on claude_insights INSERT/UPDATE. */
export async function handleRequest(req: Request): Promise<Response> {
  const botToken = Deno.env.get("BOT_TOKEN");
  const chatId = Deno.env.get("INBOX_CHAT_ID");
  if (!botToken || !chatId) {
    return new Response("Missing BOT_TOKEN or INBOX_CHAT_ID", { status: 500 });
  }

  const payload = await req.json();
  // DB webhook sends { type, table, record, ... }
  const row = payload.record;
  if (!row) {
    return new Response("No record in payload", { status: 400 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) {
    return new Response("Missing Supabase env vars", { status: 500 });
  }
  // Strictly older excludes this week's row on both INSERT and UPDATE webhooks.
  const url = `${supabaseUrl}/rest/v1/claude_insights?week=lt.${encodeURIComponent(row.week)}&order=week.desc&limit=1`;
  const resp = await fetch(url, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
  });
  if (!resp.ok) {
    return new Response("Failed to fetch previous insights", { status: 502 });
  }
  const previous = await resp.json();
  const message = formatInsights(row, previous[0]);
  await sendTelegram(botToken, chatId, message);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}
