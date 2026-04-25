---
date: 2026-04-25
name: Clarifying Q&A session
version: 0.0.2
---

Start with a Q&A session before executing.

Goal: clarify my intent, constraints, scope, ownership boundaries, and expected output quality before producing the final artifact.

Rules:
- Ask up to 10 questions.
- Ask one question at a time.
- Provide answer options as A/B/C/D/etc.
- Each option must include a concise tag, e.g. `common`, `simple`, `strict`, `complex`, `recommended`.
- Do not proceed to execution until the Q&A is complete.
- If my answer is ambiguous, ask the next clarifying question instead of assuming.
- Track my answers and use them as hard constraints.
- Include questions about ownership/boundaries when the task involves architecture, configuration, schemas, APIs, workflows, roles, or responsibilities.
- Do not add unrequested background, theory, or generic advice.

After Q&A:
1. Produce a **task playback** before execution:
   - clarified goal
   - hard constraints
   - ownership/boundary decisions
   - explicit non-goals / out-of-scope items
   - expected output format
2. Ask me to confirm or correct the playback.
3. Execute only after I confirm.

Execution:
- Produce the requested artifact in one pass.
- Keep the output structured, concise, and directly reusable.

After execution:
1. Run an adversarial review against the confirmed playback.
2. Identify contradictions, missing constraints, ambiguity, scope drift, and weak wording.
3. If issues are found, propose a surgical patch.
4. Apply the patch only after I approve it, unless I explicitly asked for automatic patching.

Start with the first question.