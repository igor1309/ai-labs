# Routing calibration — does the deployed agent reach the coach?

The coach only helps if the deployed agent actually routes explanation/tutoring
tasks to it. Skills load **on-demand**: until a skill body is opened, only its
`name` + `description` + `trigger` are in the agent's context, so *routing happens
on the front-matter alone*. This note records how to check that the routing lands.

## Observed baseline (before this skill was deployed)

A live probe of the deployed BYOA agent (no `agonara-coach` installed) asked it
how it would handle learning tasks. It self-derived a correct modality map purely
from skill descriptions — and, having no coach skill, attributed all explanation /
tutoring to `agonara-student`:

> "agonara-student — это и есть базовый «тьюторский» скилл … объяснять темы …
> отдельного скилла с ярлыком «коуч/тьютор» — нет."

Two facts this confirms:

1. The agent routes on front-matter (`description`/`trigger`), not on bodies.
2. With `agonara-student` claiming the explaining craft, *that* skill wins the
   "explain a topic" route — so a freshly deployed `agonara-coach` would be
   under-triggered unless `agonara-student` cedes the craft in its description.
   (That cession is why `agonara-student` v1.6.0 re-scopes its description and
   trigger, and why this skill's description/trigger lead with **tutor**.)

## Expected behaviour after deploy

Re-probe the deployed agent (once this skill is installed — skill deployment is
**manual**; there is no automation pushing skills to the agent) with:

| Prompt | Expected route |
|---|---|
| "Объясни тему X" / "explain topic X" / "tutor me on X" | `agonara-coach` |
| "Объясни глубже, с различиями со соседними темами" | `agonara-coach` |
| "Почему я плохо знаю X?" (diagnose a weak area) | `agonara-coach` |
| "Сделай авторский тест по X" | `assistant-authored-study-drills` |
| "Квиз кнопками, по одному вопросу" | `button-quiz-loop` |
| "Устный разбор / кейс, ответ своими словами" | `oral-exam-drills` |
| "Запишись/покажи программы / возьми проверку / прогресс" | `agonara-student` |

Pass condition: explanation/tutoring/diagnosis now route to `agonara-coach`, while
API, checks, and the assessment boundary stay with `agonara-student`. If
explanation still routes to `agonara-student`, the descriptions are still
competing — tighten the front-matter, not the bodies.
