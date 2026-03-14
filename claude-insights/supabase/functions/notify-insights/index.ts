import "@supabase/functions-js/edge-runtime.d.ts";
import { formatInsights, sendTelegram } from "../_shared/format.ts";

/** Called by Supabase Database Webhook on claude_insights INSERT/UPDATE. */
Deno.serve(async (req) => {
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

  const message = formatInsights(row);
  await sendTelegram(botToken, chatId, message);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
