# Build-loop orchestrator v3 — review against the addendum (L48–L59)

This reviews `Build-loop orchestrator v3.md` against *Verger orchestration lessons — addendum*. A subagent wrote it on 25.09.2026 without reading the premature v3.2 draft, and it was asked to keep v3.2 within 2000 words. Two of its claims were checked against the repo afterwards:
- `review-batch.sh` does not take `/tmp/verger-dev.lock`; only `gate.sh` and `plants.sh` do.
- DEV-fix.36 (`5d41070`) and DEV-fix.37, .37a and .37b are done.

**Repo state the review relies on:**
- `review-batch.sh` has the NOSPACE check, the log cap, a leftover kill and `-j` up to 5. It does **not** look at the dev lock, so L50 is not enforced anywhere.
- README §tmp-watch already gives the install line that replaces the stopgap.

## 1. Per-lesson table

| Lesson | Verdict | v3 section | Gist | Words |
|---|---|---|---|---|
| L48 | change (small) | §4 bounds, §5 toml, §10 Shadow | Bounds cover output size and free disk as well as time, including agister's own files. During Shadow, the session only runs `dev/` scripts. | +55 |
| L49 | change (folded into L48) | §4 | The disk hold lists agister's own writers first. | +12 |
| L50 | change, **v3 wrong** | §5 | `heavy` and `reviews` are independent semaphores in v3. Plants must exclude reviews. | +30 |
| L51 | change (shared with L55) | §4 / §8 | Add a `beyond_row` field to the result schema. It is passed to the owning row's brief as unverified. | +20 |
| L52 | no change | — | Plant coverage belongs in `plants.sh` and the briefs, and §11 keeps gate logic out of agister. The rule itself is flawed (§4). | 0 |
| L53 | already covered | §2 | "`planting --> exception`: a plant hung or survived" | 0 |
| L54 | no change | — | A module gotcha for web's README and checks. | 0 |
| L55 | change, **v3 wrong** | §2, §4 | v3 sends a limit-killed builder to `exception`. It should return to `briefed` with the partial diff saved. | +40 |
| L56 | already covered | §6 | "Metric triggers … become rows". At most, swap the example name. | +3 |
| L57 | change (shared with L58) | §7 | An override opens the row that retires it. | +30 |
| L58 | change (same mechanism) | §7 | So does a `!` install outside the repo. | (in L57) |
| L59 | change, **v3 wrong** | Concise, §4 Notify, §11 | v3 sends a push "for new decisions only" and gives the heartbeat alert no channel. | +45 |

Total: about +235 words.

## 2. Changes in section order

**Concise:**
- In "Limits are resources", add "free disk and output size".
- In "The owner acts through commands", replace the last sentence with: "Each new INBOX item gets one push; incidents are INBOX items too." (+12)

**§2, the step machine:**
- Add the edge `building --> briefed: provider limit (partial saved; no attempt spent)`.
- Narrow `building --> exception` to "hung, lost or no SHA, not limited".

As v3 stands, a session-limit kill goes through `exception` to a judge, which spawns an agent during a provider hold. (+15)

**§4, a new paragraph after the Bounds paragraph:**
> Bounds cover size as well as time. A run's output stream is capped (`log_cap_mb`), and every file agister appends to (run logs, `events.jsonl`) is checked after the append. Below `min_free_gb`, agister refuses to spawn, stops running groups, places `Hold(disk)` and opens an INBOX item. That item lists the largest files, agister's own run logs first (L48, L49).

This is the structural answer to L49. The unbounded writer was the orchestrator's own log, and `GET /runs/{id}/log` shows that v3 stores every run's stream with no cap. (+60)

**§4, one more paragraph:**
> A run that ends without a SHA leaves its worktree diff saved as an artifact. The next brief for that step names it, and names any `beyond_row` code another builder reported for that row, as **unverified reference: tests first** (L51, L55).

(+40) Add `beyond_row` to the builder's result schema in §8. (+5)

**§4, the Notify row:** "One push per new INBOX item. When INBOX can't be written, the push carries the whole message from memory, and the INBOX line follows once it can be written (L59)." (+30)

**§5:** add `min_free_gb = 20` and `log_cap_mb = 50` to the toml. Both are calibrations under R7. Add:
> Plants runs are load-sensitive. While one holds or waits for `heavy`, no review starts, and it starts only when running reviews have drained (L50).

This writer-preferring rule covers both orderings. The addendum's fix in `review-batch.sh` covers only reviews that start after plants. (+35)

**§7:**
> `retry` and every `!` line take a reason and open the row that retires their cause, unless one is open. The row stays open until the tested replacement is done (L57, L58).

(+30)

**§10 Shadow:** "the session orchestrator still drives, running only `dev/` scripts; any helper it needs is a row (L48)." (+15)

**§11 SPOF:** replace "the owner should be alerted when its own heartbeat stops" with:
> a watcher outside agister pushes the whole message when agister's heartbeat stops, since agister is INBOX's only writer; agister writes the INBOX line on restart.

This keeps the single-writer rule and makes the watcher an explicit case of the L59 fallback. (+15)

## 3. Cuts (about −90 words)

- The etymology paragraph (−35). It is pleasant but not part of the design.
- §11 "Commit noise": compress it to one clause (−25).
- §9: merge Replay into Chaos, since both assert the same projections (−20).
- §3: "Existing readers keep working, and nobody edits these files by hand" becomes "Hand edits are refused" (−10).

## 4. Problems in the addendum itself

- **L52 contradicts the brief.**
  - The brief asks for 2–4 plants per row, and XJ.1 covers 5 assertions, so "every assertion needs a plant" silently raises the plant count.
  - The static scan for assertions that "log but don't fail" is heuristic, because `t.Log` is legitimate, and it would add noise.
  - A better rule: plants target first the assertions the plan marks *must fail*, and the judge or the review checks log-only assertions.
  - Either way, it belongs in `plants.sh` and the briefs, not in the orchestrator.
- **L50's fix is one-sided.** Enforcing it in `review-batch.sh` doesn't stop a plants run from starting on top of running reviews. "Load-sensitive" is also undefined, and with 618 ms deadlines every plants run is load-sensitive.
- **L49 can't be enforced as a behavior rule.** Its real fix is L48: every writer is tracked. Keep the grounding sentence in CLAUDE.md, and don't add a separate mechanism for it.
- **L58 is stale.** DEV-fix.36 is done, and the README gives the replacing install. What may still be open is whether the owner has run that install. That makes it an INBOX item, not a deprioritized row.
- **L48 time zones.** "Until about 19:57" has no zone. Read as UTC, it falls after the session ended at 18:18. The README says "~24 minutes after its last review", which fits only if 19:57 and 19:33 are both MSK. Use UTC throughout.
- **L56:** "consistently slow" has no threshold. Make it a metric over the existing `steps/` medians (§6), not a judgment call.

## 5. Word count

1,710 + ~235 − ~90 ≈ **1,855 words**, which leaves about 145 in reserve.
