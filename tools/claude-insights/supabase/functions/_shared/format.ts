/** Format a claude_insights row into a Telegram message. */
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
    `📊 *Claude Insights — Week of ${week}*`,
    `${sessions} sessions · ${hours}h · ${messages} messages`,
    `${commits} commits · +${added}/\\-${removed} lines`,
  ];

  if (friction && Object.keys(friction).length > 0) {
    const top = Object.entries(friction)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([k, v]) => `${k.replace(/_/g, " ")} (${v})`)
      .join(", ");
    lines.push(`\n🔴 *Friction:* ${top}`);
  }

  if (satisfaction && Object.keys(satisfaction).length > 0) {
    const parts = Object.entries(satisfaction)
      .sort(([, a], [, b]) => b - a)
      .map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`)
      .join(" · ");
    lines.push(`\n😊 *Satisfaction:* ${parts}`);
  }

  if (goals && Object.keys(goals).length > 0) {
    const top = Object.entries(goals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([k, v]) => `${k.replace(/_/g, " ")} (${v})`)
      .join(", ");
    lines.push(`\n🎯 *Top goals:* ${top}`);
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
      parse_mode: "Markdown",
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Telegram API error: ${resp.status} — ${body}`);
  }
}
