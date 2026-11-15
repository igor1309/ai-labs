# Daily template real-call check, 2026-11-16

Checks the shipped Daily template's content against daily-notes QA S-1 to S-5 with the real
notes model. Component tests prove the template's wording and structure, not what a model writes.

## Method

`sh macos/scripts/daily-content.sh sonnet <transcript.md>...` compiles `TemplateFiles`,
`NotesGeneration` and `SummaryRuntime` from source. It builds the request with
`Generator.request` from `Files.shippedDaily`, runs it through `SummaryRuntime`'s Claude CLI attempt
(same arguments, 120 s deadline and 4 MiB limit as `Compose.swift`), and keeps only output
that passes `Generator.validate`. Exported transcripts are serialized the way the app does
(`[time] label: text`). There is no speaker evidence, and the model is the app's default primary (`sonnet`).

Inputs are the six frozen transcripts from `summary-prompt-comparison-2026-11-10.md`
(short iOS daily, planning handoff, team planning, technical walkthrough, long status,
iOS & Android daily), plus one derived cut. None of the six leaves blockers unmentioned. The cut
`call-1-no-blockers` is the short daily's greeting through 00:02:00 plus 00:04:00–00:04:16.
In that span one task is taken and nobody raises a blocker. Transcripts, outputs and the
cut stay out of the repository. They are attached to LAB-1655.

All seven requests passed structural validation on the first attempt, with Russian headings.

## Results

| Row | Verdict | Evidence |
|---|---|---|
| S-1 handoff | Holds | All seven list what to continue with next steps, owners with [mm:ss] sources, blockers paired with fixes, and meetings. None is a speaker-by-speaker recap. |
| S-2 agreed vs suggested | Holds | Each output labels its items. The short daily marks the Zoom as offered, not agreed. The planning handoff marks Lera's link as suggested with no confirmation. The 11-10 daily keeps the open-account idea and Misha's invitation as proposals. |
| S-3 owner unclear | Holds | "owner unclear" appears in every output with an ownerless action. For example, the support reply on certificates (11-10) and task 1776 (planning). |
| S-4 fix unclear | Holds | "fix unclear" appears in every output with a blocker that has no fix. For example, the testers' feedback (short daily) and Andrey's illness (planning). |
| S-5 not discussed | Holds | On the no-blockers cut, the output reads "Прочие блокеры не обсуждались". Topics nobody raised read "не обсуждались" in the other runs too (meetings in the walkthrough). "none"/"нет" never stands for an unraised topic. |

## Observations, not failures

- The labels are not always translated. Russian outputs often write `agreed`, `suggested`,
  `owner unclear` and `fix unclear` in English, against "Translate these labels" in the
  template. One run wrote a mixed-script "Агreed". Reading the labels still works. Translated labels
  remain a possible template tightening.
- On the no-blockers cut, the model listed Andrey's absence as a blocker with a conditional fix,
  above the "not discussed" line. The speaker did not frame the absence as a blocker.
- Sonnet kept the 10:20/10:30 conflict open on the 11-10 daily here. That is the opposite of its single
  smoke result on 11-10. Each run is one sample.

These are single runs judged by hand against machine text. They are not a blinded evaluation or audio-grounded truth.
