import { contextHygiene } from "./hygiene.ts";

/** Format an integer with thousands separators (e.g. 22454 -> "22,454"). */
const formatNumber = (n: number): string => n.toLocaleString("en-US");

/** Render a count map as a Markdown section: `## heading` + a transposed table
 * (keys as column headers, counts right-aligned in a single row), sorted by count desc. */
function countTable(
  heading: string,
  map: Record<string, number>,
  cap?: number,
): string {
  const entries = Object.entries(map)
    .sort(([, a], [, b]) => b - a)
    .slice(0, cap);
  const header = `| ${entries.map(([k]) => k.replace(/_/g, " ")).join(" | ")} |`;
  const separator = `|${entries.map(() => "---:").join("|")}|`;
  const values = `| ${entries.map(([, v]) => formatNumber(v)).join(" | ")} |`;
  return `\n${heading}\n${header}\n${separator}\n${values}`;
}

/** Format a claude_insights row into a Telegram message (Markdown rich message). */
export function formatInsights(
  row: Record<string, unknown>,
  previous?: Record<string, unknown> | null,
): string {
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
    "| Sessions | Duration | Messages | Commits | Lines |",
    "|---:|---:|---:|---:|---:|",
    `| ${formatNumber(sessions)} | ${formatNumber(hours)}h | ${formatNumber(messages)} | ${formatNumber(commits)} | +${formatNumber(added)} / -${formatNumber(removed)} |`,
  ];

  if (friction && Object.keys(friction).length > 0) {
    lines.push(countTable("## 🔴 Friction", friction, 3));
  }

  if (satisfaction && Object.keys(satisfaction).length > 0) {
    lines.push(countTable("## 😊 Satisfaction", satisfaction));
  }

  if (goals && Object.keys(goals).length > 0) {
    lines.push(countTable("## 🎯 Top goals", goals, 5));
  }

  const hygiene = contextHygiene(row.context_hygiene);
  const prior = contextHygiene(previous?.context_hygiene);
  if (Object.keys(hygiene).length) {
    lines.push("\n## Context hygiene");
    let hasDelta = false;
    const withDelta = (n: number, old?: number): string => {
      if (old === undefined) return formatNumber(n);
      hasDelta = true;
      const delta = n - old;
      return `${formatNumber(n)} (Δ ${delta > 0 ? "+" : ""}${formatNumber(delta)})`;
    };
    for (const [agent, data] of Object.entries(hygiene)) {
      const values: string[] = [];
      for (const [key, label] of [
        ["sessions", "sessions"], ["score", "score"],
        ["repeated_reads", "repeat reads"], ["unfiltered_builds", "raw builds"],
        ["polling_candidates", "polls"], ["large_results", "large results"],
        ["repeated_checks", "repeat checks"], ["duplicate_skill_loads", "repeat skills"],
      ]) {
        const n = data.counters[key];
        if (n !== undefined) {
          values.push(`${label} ${withDelta(n, prior[agent]?.counters[key])}`);
        }
      }
      for (const [key, n] of Object.entries(data.tokens)) {
        values.push(`${key.replace(/_/g, " ")} tokens ${withDelta(n, prior[agent]?.tokens[key])}`);
      }
      lines.push(`**${agent === "claude" ? "Claude" : "Codex"}**: ${values.join(" · ")}`);
    }
    if (hasDelta) lines.push("Δ vs previous snapshot");
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
    for (const p of paragraphs) {
      const match = sectionMap.find(([re]) => re.test(p));
      const heading = match ? match[1] : "## 📝 Notes";
      const body = match ? p.replace(match[0], "").trim() : p.trim();
      const quote = body.split("\n").map((l) => `> ${l}`).join("\n");
      lines.push(`\n${heading}\n${quote}`);
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
