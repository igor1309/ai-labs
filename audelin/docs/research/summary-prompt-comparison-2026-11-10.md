# Call-note prompt comparison, 2026-11-10

The shorter notes prompt now requests Markdown directly. JSON remains useful for the
runtime's success/error envelope and the independently validated speaker-evidence stage.
Notes no longer need a JSON object that the app immediately turns into Markdown.

## Trial

Six frozen Audelin machine transcripts: five previously untuned calls (a short daily,
a planning handoff, team planning, a technical walkthrough, and a long project status),
plus November 10 as a known regression. Each input went through Sonnet, standalone Opus,
and Sonnet followed by an Opus factual review with the original transcript supplied again.
All 18 requests completed. The returned usage identified `claude-sonnet-5-5` and
`claude-opus-5-5`; model aliases alone were not treated as provenance.

| Route | Median elapsed time | Median final document words | Total reported output tokens |
| --- | ---: | ---: | ---: |
| Sonnet | 16.4 s | 648 | 10,985 |
| Opus | 44.7 s | 948 | 26,095 |
| Sonnet → Opus review | 76.4 s combined | 898 | 49,217 including drafts |

These are single local CLI observations, with two calls processed concurrently, not
service latency guarantees or monetary/quota estimates. Reported output-token usage
can include reasoning. The review input includes both the transcript and draft, so
it also adds input usage. Word counts split on whitespace.

## Evidence from selected source checks

- On the short daily, Sonnet assigned creation of a small task to one named person,
  although the source at 06:36–06:37 is ambiguous between two people. Both Opus routes
  retained that ambiguity.
- On the planning handoff, the source explicitly names 23 December at 02:37 after an
  earlier end-November assumption. Sonnet and the reviewed draft retained the correction.
  Standalone Opus retained the date but unnecessarily called it unresolved because of
  overlapping turns. More caution does not always mean greater faithfulness.
- On team planning, Sonnet suggested a named analyst could take the blocking task;
  the source at 17:15 and 20:13 does not establish that identity. Both Opus routes left
  the owner unknown. They also restored the explicit platform correction and the
  distinction between entering testing and completing work (23:18–25:34).
- On the technical walkthrough, all three routes retained that backend methods and
  the identity-provider return contract were unfinished. Opus and the review route
  preserved more implementation and state-transition detail, but exceeded the requested
  500–800-word target.
- On the long status, all routes retained the corrected estimate of about three days
  for each of two error-handling tasks, including testing (50:20), and treated tomorrow's
  17:00 handover as something to arrange (56:59–57:29). The review did not eliminate all
  overstatement: its description of consent work starts with “finished” before describing
  returned comments and 90% completion.
- On November 10, Sonnet selected 10:30, standalone Opus selected the explicitly named
  10:20, and the review omitted the time. The machine transcript itself contains both
  values at 08:50 and 08:58; choosing a winner from text alone is unsafe. All routes
  distinguished an available MR from a merge and an identified fingerprint cause from
  a confirmed fix. None reliably retained the explicitly addressed history owner.

These are selected manual checks against machine text, not an exhaustive annotation,
audio-grounded ground truth, a blinded evaluation, or an overall accuracy score.

## Production boundary and decision

The semantic trial used the same draft prompt for both standalone models, with a separate
review prompt. Production adds exact Russian/English section names for format validation.
A separate Sonnet smoke request using that production prompt returned all required
Markdown sections. It still selected 10:30 on the conflicting November 10 transcript.
This smoke checked the prompt's document shape, not the installed app's CLI security
controls, deadline, fallback, or output-budget behavior; controlled composition tests
cover the adapter and publication path.

The trial supplied no speaker-stage mappings and did not enforce the app's conditional
4,096-token CLI cap or its API output budget. It did not compare the old production
prompt, so it cannot establish a measured improvement over that baseline.
Inputs, prompts, request hashes, results and usage records are in the private issue
artifact; meeting text is deliberately excluded from the repository.

Keep the model defaults. Standalone Opus is worth selecting manually when completeness
matters more than response time; the evidence does not justify automatically paying
for a second generation on every call. Before changing defaults, compare old and new
production prompts under the same runtime budgets on a separately annotated corpus,
including source conflicts, and measure unsupported claims and missed commitments.
