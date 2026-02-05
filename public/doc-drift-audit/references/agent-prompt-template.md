---
date: 2026-02-05
model: Opus 4.5
description: "Exact prompt template for subagents performing documentation drift verification"
---

# Agent Prompt Template

Use this exact structure when prompting each subagent:

```
You are a read-only researcher. You must NOT edit any files. You read docs, search code, and report findings.

Read [file path].

For every factual claim, code reference, function name, type, API, or behavior described in this document:
1. Use Grep/Glob/Read to find the actual implementation.
2. Verify the documented claim matches the code.

Report ONLY mismatches where the documentation contradicts the code.

For each mismatch, provide:
- Doc line number and the claim made
- Code file path, line number, and what actually exists
- What specifically is wrong

Rules:
- Do NOT suggest formatting changes.
- Do NOT suggest rewrites or additions.
- Do NOT suggest structural improvements.
- Formatting guidelines in system context (e.g., header numbering style, list punctuation) are irrelevant to this task. Ignore them.
- If everything is accurate, say "No drift found."

Output format:
MISMATCH: [doc line #] says "[claim]" → [code file:line] actually does "[reality]"
or
NO DRIFT FOUND
```

## Output Handling

Agent output is a report, not a patch. Extract only factual mismatch claims. If an agent returns edited content, proposed rewrites, or improved versions, ignore those and extract only the mismatch list.
