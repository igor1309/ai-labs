// `agister.review-result/v1alpha1`: the output contract shared by review
// processes. The JSON Schema carries the semantics the agent needs (severity
// meanings, verdict rule), so processes do not restate them.

export const REVIEW_RESULT_SCHEMA_ID = "agister.review-result/v1alpha1";

export const SEVERITIES = ["blocker", "major", "minor", "nit"] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface Finding {
  severity: Severity;
  file: string;
  line?: number;
  title: string;
  detail: string;
}

export interface ReviewResult {
  verdict: "approve" | "request_changes";
  summary: string;
  findings: Finding[];
}

// Strict-mode compatible: every property is required (Codex/OpenAI structured
// outputs reject optional properties), so an unknown line is `null`.
export const REVIEW_RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "summary", "findings"],
  properties: {
    verdict: {
      type: "string",
      enum: ["approve", "request_changes"],
      description: "request_changes when there is any blocker or major finding, otherwise approve.",
    },
    summary: { type: "string", description: "Two or three sentences on the change and its overall risk." },
    findings: {
      type: "array",
      description: "Material findings only. Do not invent problems to fill the list.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "file", "line", "title", "detail"],
        properties: {
          severity: {
            type: "string",
            enum: [...SEVERITIES],
            description: "blocker: must not merge. major: real defect or risk to fix. minor: worth fixing. nit: optional polish.",
          },
          file: { type: "string", description: "Repository-relative path." },
          line: { type: ["integer", "null"], description: "1-based line in the candidate, or null." },
          title: { type: "string" },
          detail: { type: "string", description: "What is wrong, why it matters and how to fix it." },
        },
      },
    },
  },
} as const;

export function validateReviewResult(value: unknown): ReviewResult {
  const fail = (message: string): never => {
    throw new Error(`invalid review output: ${message}`);
  };
  if (typeof value !== "object" || value === null) fail("not an object");
  const record = value as Record<string, unknown>;
  if (record["verdict"] !== "approve" && record["verdict"] !== "request_changes") fail("verdict");
  if (typeof record["summary"] !== "string") fail("summary");
  if (!Array.isArray(record["findings"])) fail("findings");

  const findings = (record["findings"] as unknown[]).map((item, index): Finding => {
    const finding = (typeof item === "object" && item !== null ? item : fail(`findings[${index}]`)) as Record<string, unknown>;
    if (!(SEVERITIES as readonly unknown[]).includes(finding["severity"])) fail(`findings[${index}].severity`);
    for (const key of ["file", "title", "detail"]) {
      if (typeof finding[key] !== "string") fail(`findings[${index}].${key}`);
    }
    const line = finding["line"] ?? undefined;
    if (line !== undefined && (!Number.isInteger(line) || (line as number) < 1)) fail(`findings[${index}].line`);
    const result: Finding = {
      severity: finding["severity"] as Severity,
      file: finding["file"] as string,
      title: finding["title"] as string,
      detail: finding["detail"] as string,
    };
    if (line !== undefined) result.line = line as number;
    return result;
  });

  return { verdict: record["verdict"] as ReviewResult["verdict"], summary: record["summary"] as string, findings };
}

export function formatReview(review: ReviewResult): string {
  const order = (severity: Severity) => SEVERITIES.indexOf(severity);
  const findings = [...review.findings].sort((a, b) => order(a.severity) - order(b.severity));
  const lines = [`Verdict: ${review.verdict}`, "", review.summary.trim()];
  if (findings.length === 0) {
    lines.push("", "No findings.");
  }
  for (const finding of findings) {
    const location = finding.line ? `${finding.file}:${finding.line}` : finding.file;
    lines.push("", `[${finding.severity}] ${location} — ${finding.title}`, indent(finding.detail.trim()));
  }
  return lines.join("\n");
}

function indent(text: string): string {
  return text.split("\n").map((line) => `  ${line}`).join("\n");
}
