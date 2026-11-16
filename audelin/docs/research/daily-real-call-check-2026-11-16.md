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

## Real calls in the app

Next, I remade the notes with Daily on three real "iOS daily" calls in the installed Audelin
(build 3a0e620f3, the `opus` primary model, Keep previous on). It ran the way a user does:
select the call, open Make again, check that Keep previous is on, choose Daily. The
`sh macos/scripts/live/run-driver.sh macos/scripts/live/real-daily-remake.swift <call id>...`
driver does those steps through accessibility in the running app. It writes nothing to the
calls folder itself. Before the run I copied each call's `summary.md` aside. Afterwards I decoded
the receipt and compared it with that copy.

| Call | Before | Previous after | Current after | S-1 | S-2 | S-3 | S-4 | S-5 |
|---|---|---|---|---|---|---|---|---|
| 2026.11.11-1000 | Default notes, no template recorded | Byte-identical to the original body, attributed to Default | Daily, Russian headings | Holds | Holds | Holds | Holds | n/a |
| 2026.11.12-0959 | Same | Byte-identical, Default | Daily | Holds | Holds | Holds | Holds | n/a |
| 2026.11.13-0959 | Same | Byte-identical, Default | Daily | Holds | Holds | Holds | Holds | n/a |

In all three calls the original notes survived untouched as Previous, and Current is attributed to Daily.
- S-2: items are labelled Согласовано / Предложено (11-12) or agreed / suggested (11-11, 11-13). For example, the proposed post-daily OTP call is kept as suggested, and the frontend workaround as agreed.
- S-3: "Owner unclear" appears, for example, on checking the iOS landing's documents block (11-11) and the backend dispute API (11-12).
- S-4: "Fix unclear" appears, for example, on Misha's missed urgent message (11-11) and P2P OPE testing (11-12).
- S-5: each of these calls raises blockers, so the "blockers not discussed" case cannot occur. No output writes "none"/"нет" for a topic. S-5's positive evidence remains the no-blockers cut above.

The English-label leak noted above shows up here too (11-13: **Agreed** / **Suggested**).
The notes stay in the user's calls folder and are not copied into the repository.

## Automated check (LAB-1657)

`audelin-daily-content.yml` reruns the script check on the self-hosted Mac when a pull request changes
`TemplateFiles`, `NotesGeneration` or `NotesPreferences.swift`, and weekly. `macos/scripts/daily-content-ci.sh`
makes notes with the default notes model from `~/Library/Application Support/Audelin Daily Content/calls`
and `macos/scripts/daily-content-check.py` checks them against that folder's `expect.json`: the four Daily
headings (S-1), an agreed or suggested label (S-2), "owner unclear" (S-3) and "fix unclear" (S-4) where the
call leaves them open, "not discussed" in Blockers on the no-blockers cut, and no bare "none"/"нет" for a
topic (S-5). Translated labels and Russian paraphrases count. S-3 and S-4 depend on how one model sample words its
labels, so they are reported but never gate; S-1, S-2 and S-5 gate, and a call that fails them gets one new sample
before the check fails. Each failure names the call and the row. A model-as-judge score for
agreed vs suggested is added to the report and never gates. The in-app remake stays manual, because it
writes to the real calls folder.
