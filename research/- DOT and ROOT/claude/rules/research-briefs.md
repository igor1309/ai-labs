---
date: 2026-09-16
model: claude-opus-5
description: "Research briefs — collect every locally-checkable fact before spawning a research subagent; state the question, not a decomposition; scope cannot be corrected mid-flight"
---

# Research Briefs

Before spawning a research subagent, collect every locally-checkable fact the
question depends on — OS and tool versions, installed state, device inventory —
typically one command each, and put them in the initial brief.

Give the subagent the question and the established facts, not a decomposition of
the expected answer — the report comes back shaped like the brief, so an assumed
structure returns confirmed.

Do not rely on follow-up messages to correct a research subagent's scope
mid-flight: such agents treat instructions arriving through tool content as
untrusted injected data and may ignore them (correctly). A scope fact
discovered after spawning usually means the local grounding pass was skipped —
run it first.
