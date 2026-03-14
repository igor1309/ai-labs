import "@supabase/functions-js/edge-runtime.d.ts";
import { formatInsights, sendTelegram } from "../_shared/format.ts";
import { analyzeTrends } from "../_shared/llm.ts";

/** Telegram bot webhook handler. Responds to /latest and /compare commands. */
Deno.serve(async (req) => {
  const botToken = Deno.env.get("BOT_TOKEN");
  const chatId = Deno.env.get("INBOX_CHAT_ID");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!botToken || !chatId || !supabaseUrl || !supabaseKey) {
    return new Response("Missing env vars", { status: 500 });
  }

  const update = await req.json();
  const text = update?.message?.text?.trim() ?? "";
  const fromChatId = String(update?.message?.chat?.id ?? "");

  // Only respond to our chat
  if (fromChatId !== chatId) {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (text === "/latest" || text === "/start") {
    const url = `${supabaseUrl}/rest/v1/claude_insights?order=week.desc&limit=1`;
    const resp = await fetch(url, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    if (!resp.ok) {
      await sendTelegram(botToken, chatId, "Failed to fetch insights from Supabase.");
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const rows = await resp.json();
    if (rows.length === 0) {
      await sendTelegram(botToken, chatId, "No insights data yet.");
    } else {
      const message = formatInsights(rows[0]);
      await sendTelegram(botToken, chatId, message);
    }
  } else if (text === "/compare") {
    const url = `${supabaseUrl}/rest/v1/claude_insights?order=week.desc`;
    const resp = await fetch(url, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    if (!resp.ok) {
      await sendTelegram(botToken, chatId, "Failed to fetch insights from Supabase.");
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const rows = await resp.json();
    if (rows.length < 2) {
      await sendTelegram(botToken, chatId, "Not enough data for comparison.");
    } else {
      const analysis = await analyzeTrends(rows);
      await sendTelegram(botToken, chatId, analysis);
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
