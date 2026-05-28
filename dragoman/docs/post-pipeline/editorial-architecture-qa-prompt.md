---
title: "Editorial Architecture Q&A Prompt"
date: 2026-05-01
model: gpt-5.5-thinking
type: "prompt"
description: "Clarify editorial architecture for a Telegram post before drafting"
---

# Editorial Architecture Q&A Prompt

Для этой сессии используем русский язык.

Вот идея-сырой набросок для нового поста в мой телеграм-канал The Dragoman:

```markdown
{{IDEA-DRAFT}}
```

Начнём не с текста поста, а с его editorial architecture: зачем этот пост существует, что он пытается объяснить, какую путаницу снимает, какой тезис держит и где проходят границы темы.

Используй Q&A session ниже, чтобы через интервью со мной собрать архитектуру поста.

---

## Scope

This session is only for editorial architecture.

- Do not write the post.
- Do not draft paragraphs.
- Do not suggest final wording.
- Do not polish prose.
- Do not imitate or refine voice.
- Do not move into drafting unless I explicitly ask.

The expected output is an editorial architecture document, not a post draft.

The goal is to clarify:
- why this post should exist
- what reader problem, confusion, or tension it addresses
- what thesis it should defend
- what shift in reader understanding it should produce
- what the post should own as its main claim
- what it may mention but should not explain
- what should be excluded
- what structure can best support the argument

---

## Q&A Session Rules

Start with a Q&A session before producing the editorial architecture.

Goal: clarify my intent, constraints, scope, editorial boundaries, and expected output quality before producing the final architecture document.

Rules:
- Ask only as many questions as necessary.
- Maximum: 10 questions.
- Stop earlier if the editorial architecture is already sufficiently constrained.
- Ask one question at a time.
- Provide answer options as А/Б/В/Г/etc.
- Each option must include a concise tag, e.g. `core`, `simple`, `strict`, `complex`, `recommended`.
- Do not ask a question if its answer is already implied by previous answers.
- Do not re-ask the same constraint under a different formulation.
- Do not proceed to the architecture document until the Q&A is sufficiently complete.
- If my answer is ambiguous, ask the next clarifying question instead of assuming.
- Track my answers and use them as hard constraints.
- Do not add unrequested background, theory, or generic advice.
- Do not write the post during Q&A.

Prioritize questions about:
- purpose
- reader job-to-be-done
- core thesis
- core tension
- target misunderstanding
- argument boundaries
- non-goals
- possible structure

---

## After Q&A

Produce an editorial architecture playback before the final architecture document.

The playback must include:
- clarified purpose
- reader job-to-be-done
- core thesis
- core tension
- target misunderstanding or confusion
- argument map
- editorial boundaries
- explicit non-goals / out-of-scope items
- expected output format
- recommended structure

Ask me to confirm or correct the playback.

Do not produce the final architecture document until I confirm the playback.

---

## Final Output

After I confirm the playback, produce the final editorial architecture document in one pass.

The final document must include:
- title / working angle
- purpose
- reader job-to-be-done
- core thesis
- core tension
- target misunderstanding
- argument map
- editorial boundaries
- non-goals
- recommended structure
- open risks or weak spots

Keep the output structured, concise, and directly reusable.

Do not write the post.

---

## Review

After producing the final editorial architecture document:

1. Run an adversarial review against the confirmed playback.
2. Identify contradictions, missing constraints, ambiguity, scope drift, and weak reasoning.
3. If issues are found, propose a surgical patch.
4. Apply the patch only after I approve it, unless I explicitly asked for automatic patching.

Start with the first question.
