---
name: postmortem
author: Igor Malyarov
version: "0.1.0"
description: Reflect on the current session and propose polish/tweaks/fixes for a named skill, grounded in evidence from this conversation. Use when wrapping up a session that exercised a skill — to capture what worked, what should be fixed, and what adjacent skills were missing. Sibling to skill-review, but session-scoped instead of corpus-scoped.
argument-hint: "<skill-name>"
disable-model-invocation: true
---

# Postmortem

Based on this session, what is your take on $ARGUMENTS — does it need some polish/tweaks/fixes? What other skills might it be worth adding/tweaking?

If `$ARGUMENTS` is empty, ask the user which skill(s) to review before proceeding.

Ground every observation in something that actually happened in this session: a place the skill helped, a place it should have helped but didn't, a place it gave wrong guidance, or a gap you had to work around. Do not invent generic "best practice" suggestions.

Structure the response as:

1. **Verdict** — one line: solid as-is / needs polish / needs fixes / needs redesign.
2. **What worked** — concrete moments the skill earned its keep.
3. **What to polish/fix** — specific edits (file:line if known), with the session evidence that motivates each.
4. **Adjacent skills worth adding or tweaking** — only if a real gap surfaced in this session. Name the skill, the gap, and the trigger that should invoke it.

Be terse. No filler, no hedging, no "great question."
