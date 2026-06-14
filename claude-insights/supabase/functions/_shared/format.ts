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

  let narrative = row.narrative_summary as string | null;
  if (narrative && narrative.length > 0) {
    const RICH_MESSAGE_LIMIT = 32768;
    const budget = RICH_MESSAGE_LIMIT - lines.join("\n").length - 512;
    if (narrative.length > budget) {
      narrative = narrative.slice(0, Math.max(0, budget)) + "…";
    }
    const sectionMap: [RegExp, string][] = [
      [/^What's working:/, "## ✅ What's working"],
      [/^What's hindering[^:]*:/, "## ⚠️ What's hindering"],
      [/^Quick wins to try:/, "## 💡 Quick wins"],
      [/^Ambitious workflows:/, "## 🚀 Ambitious workflows"],
    ];
    const paragraphs = narrative.split("\n\n").filter((p) => p.trim());
    let first = true;
    for (const p of paragraphs) {
      const match = sectionMap.find(([re]) => re.test(p));
      const heading = match ? match[1] : "## 📝 Notes";
      const body = match ? p.replace(match[0], "").trim() : p.trim();
      const open = first ? " open" : "";
      lines.push(`\n${heading}\n<details${open}><summary>Details</summary>\n${body}\n</details>`);
      first = false;
    }
  }

  return lines.join("\n");
}

/** Send a Markdown rich message via the Telegram Bot API. */
export async function sendTelegram(
  botToken: string,
  chatId: string,
  markdown: string,
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendRichMessage`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      rich_message: { markdown },
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Telegram API error: ${resp.status} — ${body}`);
  }
}
