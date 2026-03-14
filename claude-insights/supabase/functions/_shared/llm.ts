/** LLM call helper for trend analysis via Nomos. */

const SYSTEM_PROMPT = [
  "You are an analyst reviewing weekly Claude Code usage snapshots.",
  "Each snapshot contains: session count, duration, messages, commits, lines changed, friction points, satisfaction scores, goals, and a narrative summary.",
  "Compare the weeks chronologically. Focus on what changed, what improved, what regressed.",
  "Be concise. Use plain text, no markdown — the output goes to a Telegram chat.",
].join("\n");

/** Send weekly snapshots to the LLM and return a narrative trend analysis. */
export async function analyzeTrends(
  rows: Record<string, unknown>[],
): Promise<string> {
  const baseUrl = Deno.env.get("NOMOS_BASE_URL");
  const apiKey = Deno.env.get("NOMOS_API_KEY");
  if (!baseUrl || !apiKey) {
    throw new Error("Missing NOMOS_BASE_URL or NOMOS_API_KEY");
  }

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-4",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Here are ${rows.length} weekly Claude Code usage snapshots (newest first):\n\n${JSON.stringify(rows, null, 2)}`,
        },
      ],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Nomos API error: ${resp.status} — ${body}`);
  }

  const data = await resp.json();
  return data.choices[0].message.content;
}
