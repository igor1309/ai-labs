/** Render a count map as a Markdown section: `## heading` + a two-column table. */
function countTable(
  heading: string,
  label: string,
  map: Record<string, number>,
  cap?: number,
): string {
  const rows = Object.entries(map)
    .sort(([, a], [, b]) => b - a)
    .slice(0, cap)
    .map(([k, v]) => `| ${k.replace(/_/g, " ")} | ${v} |`)
    .join("\n");
  return `\n${heading}\n| ${label} | Count |\n|:------|------:|\n${rows}`;
}

/** Format a claude_insights row into a Telegram message (Markdown rich message). */
export function formatInsights(row: Record<string, unknown>): string {
  const week = row.week as string;
  const sessions = row.total_sessions as number;
  const duration = row.total_duration_minutes as number;
  const messages = row.total_user_messages as number;
  const added = row.lines_added as number;
  const removed = row.lines_removed as number;
  const commits = row.total_commits as number;
  const hours = Math.round(duration / 60);

  const friction = row.friction as Record<string, number> | null;
  const satisfaction = row.satisfaction as Record<string, number> | null;
  const goals = row.goals as Record<string, number> | null;

  const lines: string[] = [
    `# 📊 Claude Insights — Week of ${week}`,
    "| Metric | Value |",
    "|:-------|------:|",
    `| Sessions | ${sessions} |`,
    `| Duration | ${hours}h |`,
    `| Messages | ${messages} |`,
    `| Commits | ${commits} |`,
    `| Lines | +${added} / -${removed} |`,
  ];

  if (friction && Object.keys(friction).length > 0) {
    lines.push(countTable("## 🔴 Friction", "Issue", friction, 3));
  }

  if (satisfaction && Object.keys(satisfaction).length > 0) {
    lines.push(countTable("## 😊 Satisfaction", "Signal", satisfaction));
  }

  if (goals && Object.keys(goals).length > 0) {
    lines.push(countTable("## 🎯 Top goals", "Goal", goals, 5));
  }

  const narrative = row.narrative_summary as string | null;
  if (narrative && narrative.length > 0) {
    const sectionMap: [RegExp, string][] = [
      [/^What's working:/, "✅ <b>What's working:</b>"],
      [/^What's hindering[^:]*:/, "⚠️ <b>What's hindering:</b>"],
      [/^Quick wins to try:/, "💡 <b>Quick wins:</b>"],
      [/^Ambitious workflows:/, "🚀 <b>Ambitious workflows:</b>"],
    ];
    const paragraphs = narrative.split("\n\n").filter((p) => p.trim());
    for (const p of paragraphs) {
      const match = sectionMap.find(([re]) => re.test(p));
      if (match) {
        const body = p.replace(match[0], "").trim();
        lines.push(`\n${match[1]}\n<blockquote>${body}</blockquote>`);
      } else {
        lines.push(`\n<blockquote>${p}</blockquote>`);
      }
    }
  }

  return lines.join("\n");
}

/** Send a message via Telegram Bot API. */
export async function sendTelegram(
  botToken: string,
  chatId: string,
  text: string,
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Telegram API error: ${resp.status} — ${body}`);
  }
}
