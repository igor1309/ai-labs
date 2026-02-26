/**
 * Default injection detection patterns (regex-based, configurable).
 * Best-effort only — no illusion of perfect safety.
 */
const DEFAULT_PATTERNS = [
  { name: "ignore_previous", regex: /ignore\s+(all\s+)?previous\s+instructions/i },
  { name: "disregard_instructions", regex: /disregard\s+(your|all|any)\s+(instructions|rules|guidelines)/i },
  { name: "new_instructions", regex: /new\s+instructions\s*:/i },
  { name: "you_are_now", regex: /you\s+are\s+now\s+(?:a|an|the|my)\b/i },
  { name: "system_prompt_leak", regex: /(?:reveal|show|output|print|display)\s+(?:your\s+)?system\s+prompt/i },
  { name: "jailbreak_prefix", regex: /\b(?:DAN|STAN|DUDE|AIM)\s+mode\b/i },
  { name: "role_override", regex: /\[(?:system|SYSTEM)\]/i },
  { name: "prompt_injection_marker", regex: /<\/?(?:system|admin|root)>/i },
];

/**
 * Dangerous character patterns to strip during sanitization.
 */
const SANITIZE_PATTERNS = [
  { name: "null_bytes", regex: /\x00/g, replacement: "" },
  { name: "zero_width_chars", regex: /[\u200B\u200C\u200D\uFEFF\u2060]/g, replacement: "" },
  { name: "rtl_override", regex: /[\u202A-\u202E\u2066-\u2069]/g, replacement: "" },
];

export function redactContent(content, maxLen = 50) {
  if (!content || typeof content !== "string") return "***";
  if (content.length <= maxLen) return content;
  const half = Math.floor(maxLen / 2);
  return content.slice(0, half) + "..." + content.slice(-half);
}

export function createSafeguards({ config = {}, logger }) {
  const enabled = config.safeguardsEnabled !== false;
  const sanitizeEnabled = config.safeguardsSanitize !== false;
  const reinforceEnabled = config.safeguardsReinforce === true;
  const blockOnDetect = config.safeguardsBlockOnDetect === true;
  const prependText = config.safeguardsReinforcePrepend || "";
  const appendText = config.safeguardsReinforceAppend || "";
  const patterns = config.safeguardsPatterns || DEFAULT_PATTERNS;

  function scanMessages(messages) {
    if (!enabled) {
      return { safe: true, findings: [], sanitized: messages };
    }

    const findings = [];
    const sanitized = messages.map((msg, i) => {
      const content = msg.content;
      if (typeof content !== "string") return msg;

      // Check injection patterns
      for (const pattern of patterns) {
        if (pattern.regex.test(content)) {
          findings.push({
            pattern: pattern.name,
            message_index: i,
            redacted_content: redactContent(content),
          });
        }
      }

      // Apply sanitization
      if (!sanitizeEnabled) return msg;

      let cleaned = content;
      for (const sp of SANITIZE_PATTERNS) {
        cleaned = cleaned.replace(sp.regex, sp.replacement);
      }
      return cleaned !== content ? { ...msg, content: cleaned } : msg;
    });

    return {
      safe: findings.length === 0,
      findings,
      sanitized,
    };
  }

  function reinforceMessages(messages) {
    if (!reinforceEnabled || (!prependText && !appendText)) {
      return messages;
    }

    const result = [...messages];
    const hasSystemMsg = result.length > 0 && result[0].role === "system";

    if (hasSystemMsg) {
      let content = result[0].content;
      if (prependText) content = prependText + "\n" + content;
      if (appendText) content = content + "\n" + appendText;
      result[0] = { ...result[0], content };
    } else {
      const parts = [];
      if (prependText) parts.push(prependText);
      if (appendText) parts.push(appendText);
      result.unshift({ role: "system", content: parts.join("\n") });
    }

    return result;
  }

  return {
    scanMessages,
    reinforceMessages,
    get enabled() { return enabled; },
    get blockOnDetect() { return blockOnDetect; },
  };
}
