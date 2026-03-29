/** LLM call helper for trend analysis via Nomos. */

const SYSTEM_PROMPT = [
  "You are an analyst reviewing weekly Claude Code usage snapshots.",
  "Each snapshot contains: session count, duration, messages, commits, lines changed, friction points, satisfaction scores, goals, and a narrative summary.",
  "Compare the weeks chronologically. Focus on what changed, what improved, what regressed.",
  "Be concise. Use plain text, no markdown — the output goes to a Telegram chat.",
].join("\n");

type Snapshot = {
  week: unknown;
  total_sessions: unknown;
  total_duration_minutes: unknown;
  total_user_messages: unknown;
  total_commits: unknown;
  lines_added: unknown;
  lines_removed: unknown;
  friction: unknown;
  satisfaction: unknown;
  goals: unknown;
  narrative_summary: unknown;
};

const NARRATIVE_MAX_CHARS = 500;

function projectSnapshot(row: Record<string, unknown>): Snapshot {
  const narrative = typeof row.narrative_summary === "string"
    ? row.narrative_summary.slice(0, NARRATIVE_MAX_CHARS)
    : row.narrative_summary;
  return {
    week: row.week,
    total_sessions: row.total_sessions,
    total_duration_minutes: row.total_duration_minutes,
    total_user_messages: row.total_user_messages,
    total_commits: row.total_commits,
    lines_added: row.lines_added,
    lines_removed: row.lines_removed,
    friction: row.friction,
    satisfaction: row.satisfaction,
    goals: row.goals,
    narrative_summary: narrative,
  };
}

/** Send weekly snapshots to the LLM and return a narrative trend analysis. */
export async function analyzeTrends(
  rows: Record<string, unknown>[],
): Promise<string> {
  const baseUrl = Deno.env.get("NOMOS_BASE_URL");
  const apiKey = Deno.env.get("NOMOS_API_KEY");
  if (!baseUrl || !apiKey) {
    throw new Error("Missing NOMOS_BASE_URL or NOMOS_API_KEY");
  }

  const snapshots = rows.map(projectSnapshot);

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
          content: `Here are ${snapshots.length} weekly Claude Code usage snapshots (newest first):\n\n${JSON.stringify(snapshots, null, 2)}`,
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
