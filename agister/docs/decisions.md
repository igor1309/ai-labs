# Decisions

## D-1: How the Knowledge tab's editing fits ADR-009's read-only pages

- **Status:** Owner
- **Asked by:** Orchestrator, Multica issue LAB-44, before implementation; advisor run 20261002T084003Z-b61743 answered `owner`
- **Question:** LAB-44 asks the Agister pages to let the owner edit skill content (and agent configuration) from a new Knowledge tab, saving to disk. ADR-009 rule 2 says `agister pages` only reads and changes no setting. How does the Knowledge tab's editing fit?
- **Options:** 1. Amend ADR-009 with a new ADR: pages may write skill files and agent settings files, on loopback with the X-Agister-Pages header, refusing paths outside the shown repo's skill/settings folders; every other rule of ADR-009 stays. 2. Keep pages read-only: the Knowledge tab shows everything and offers "open in editor" / copyable paths; editing happens outside the page. 3. Split: ship the read-only Knowledge tab now (models, skills, usage, static checks), and take editing as a separate ADR and issue later.
- **Excluded:** 1: not now; writing from the page is its own ADR and issue. 2: editing in the page stays wanted.
- **Decision:** 3. Split: ship the read-only Knowledge tab now (models, skills, usage, static checks), and take editing as a separate ADR and issue later.
- **Rests on:** none
- **Follow-ups:** the read-only Knowledge tab (LAB-44); editing from the page as a separate issue with its own ADR amending ADR-009.

## D-2: What the Knowledge tab shows as an agent's skills

- **Status:** Owner
- **Asked by:** Orchestrator, Multica issue LAB-44, before implementation; advisor run 20261002T084003Z-c9b85f answered `owner`
- **Question:** LAB-44 asks to show "which skills are assigned to" each agent and to edit those assignments. Agister agents have no skills setting: by ADR-006 a call loads whatever skills its runtime loads from the repository (and the user's home), and Agister neither copies nor filters them. What does the Knowledge tab show as an agent's skills, and what is an "assignment"?
- **Options:** 1. No assignment concept: an agent's configured skills are the skills its runtime would load in that repo (repo skill folders per runtime, e.g. `.claude/skills`, `.agents/skills`, plus home folders), shown per runtime; "editing an assignment" is out of scope and the tab says so. Observed usage comes from run events. 2. Add an explicit per-agent `skills` setting (a new ADR amending ADR-006) that filters what a call loads, and let the tab edit it. 3. Show only observed usage from runs per agent, with no configured-skills view.
- **Excluded:** 2: changes ADR-006; Agister keeps not filtering skills. 3: hides what an agent would load.
- **Decision:** 1. No assignment concept: an agent's configured skills are the skills its runtime would load in that repo (repo skill folders per runtime, e.g. `.claude/skills`, `.agents/skills`, plus home folders), shown per runtime; "editing an assignment" is out of scope and the tab says so. Observed usage comes from run events.
- **Rests on:** none
- **Follow-ups:** the Knowledge tab lists, per agent, the skills its runtime would load and, apart from them, the skills its runs used.

## D-3: Whether ADR-011 rule 9 holds against a skill file replaced or grown mid-read

- **Status:** Owner
- **Asked by:** code_review workflow run 20261002T100435Z-97deae, judge item 3 (sources 3#1); advisor run 20261002T101256Z-d911e9 answered `owner`
- **Question:** must ADR-011 rule 9 hold against a file replaced or grown while a request is reading it?
- **Options:** (a) yes: read through a directory-confined handle, validate that handle and bound the read, keep the reader seam, and add committed replacement and growth tests built with a hook; (b) no: accept the race for a local read-only viewer and record that limit in ADR-011.
- **Excluded:** (a): only someone who can already write the user's skill folders can race the read; a local read-only viewer does not need a confined-handle mechanism for that.
- **Decision:** (b) no: accept the race for a local read-only viewer and record that limit in ADR-011.
- **Rests on:** ADR-009, ADR-011
- **Follow-ups:** ADR-011's Limitation names the race.

## D-4: The Knowledge tab renders Markdown with markdown-it

- **Status:** Owner
- **Asked by:** Orchestrator, after code_review runs 20261002T094525Z-b624bc and 20261002T100435Z-97deae found four defects in the hand-written Markdown renderer
- **Question:** keep the hand-written Markdown renderer in `pages/knowledge.js`, or reuse an established, maintained one?
- **Options:** 1. markdown-it, vendored as one file and run in the page; its tokens are turned into elements by the page, never into an HTML string. 2. Keep the hand-written renderer.
- **Excluded:** 2: an established parser (500+ stars, maintained within two months) beats ours on edge cases; goldmark on the server was the runner-up but needs innerHTML in the page and has an open quadratic-emphasis issue in v2.1.6.
- **Decision:** 1. markdown-it, vendored as one file and run in the page; its tokens are turned into elements by the page, never into an HTML string.
- **Rests on:** ADR-009, ADR-011
- **Follow-ups:** the hand-written parser in `knowledge.js` is replaced; tests show raw HTML as text, unsafe links as text, tables and nested lists, and bounded work on worst-case input.

## D-5: Is an ADR committed earlier on an unmerged branch already recorded and immutable?

- **Status:** Owner
- **Asked by:** workflow run 20261002T102838Z-2f213a (code_review), judge item "ADR-010 (now ADR-012) edited after it was first committed on the branch"
- **Question:** does an ADR proposed earlier in the same unmerged branch count as recorded and therefore immutable?
- **Options:** (a) treat it as still a draft and keep the edit, folded into a single commit if a clean history matters; (b) restore the e8b1c614 text, keeping the original context, and record the acceptance or the revised context separately through the decision process; (c) restore only the original context and keep the status change.
- **Excluded:** (b) and (c): an ADR on an unmerged branch is still under review, and restoring text that review rejected would record a known defect.
- **Decision:** (a). An ADR stays a draft until its branch merges to trunk, so it may be edited on that branch. The history is kept by the pull request's merge commit, not by squashing.
- **Rests on:** none
- **Follow-ups:** none

## D-6: Which run's changes a continuation of a session that has moved on carries

- **Status:** Owner
- **Asked by:** workflow run 20261002T122745Z-ee8d5b (adr_review), judge item "The named run's patch can lag behind the resumed session"; advisor run 20261002T123105Z-e8dad6 answered owner
- **Question:** how should ADR-013 handle a checkout continuation of a run whose session has since moved on?
- **Options:** (a) as the reviewer proposes, refuse such continuations and amend ADR-001 rule 12's repeat-continuation allowance, along with the test at main_test.go:782; (b) keep repeat continuation and restore the patch of the session's latest run rather than the named run, rewording ADR-013 rules 34 and 66 to match. Either way, ADR-013 must stop claiming at line 66 that the patch delivers everything the session has done unless the chosen rule makes that true.
- **Excluded:** (a): it removes the repeat continuation ADR-001 rule 12 allows and its tests check, while the changes can follow the session instead.
- **Decision:** (b). A continuation carries the `changes.patch` of the session's latest run, which matches the session it resumes. The base checks apply to that run.
- **Rests on:** none
- **Follow-ups:** ADR-013 rules 1, 2, 3 and 5 name the session's latest run; a test continues run A after B continued it and asserts B's patch is carried.

## D-7: How ADR-013 handles continuation chains made before it

- **Status:** Owner
- **Asked by:** workflow run 20261002T123937Z-f648c5 (adr_review), judge item "ADR-013's whole-session preservation guarantee does not hold for the legacy continuation chains it accepts"; advisor run 20261002T124413Z-f6d4fe answered owner
- **Question:** ADR-013 promises to carry the whole session's changes, but restoring the latest legacy patch (a pre-ADR run) can lose earlier runs' changes. How should the ADR handle legacy continuation chains?
- **Options:** (a) keep accepting legacy records, narrow the guarantee at line 73 to the latest run's captured checkout state, and document the legacy limitation; (b) refuse to continue legacy chains whose cumulative preservation cannot be established, so the whole-session guarantee holds as written; (c) restrict the whole-session guarantee to chains made entirely after this ADR, and state plainly that legacy chains carry only their latest run's patch.
- **Excluded:** (a): it weakens the guarantee for every session, not only the legacy ones. (b): it stops sessions that can still be continued usefully, and D-6 keeps repeat continuation.
- **Decision:** (c). The whole-session guarantee holds for chains made entirely after ADR-013. A legacy chain carries only its latest run's patch, and ADR-013 says so.
- **Rests on:** D-6
- **Follow-ups:** none

## D-8: Is ADR-018, edited after its first commit on the unmerged branch, still a draft?

- **Status:** Owner
- **Asked by:** workflow run 20261003T090214Z-2d9680 (code_review), judge item "Implementation commit rewrites ADR-018 rule 5's exemption wording"; advisor run 20261003T090858Z-c19838 answered `owner`
- **Question:** does an ADR committed earlier on the same unmerged branch count as a recorded decision?
- **Options:** (a) no: keep the clarified install/restore exemption as part of ADR-018 before merge; (b) yes: restore the original sentence and record the install/restore exemption as an owner-authored amendment.
- **Excluded:** (b): an ADR stays a draft until its branch merges to trunk (D-5).
- **Decision:** (a). ADR-018 rule 5 keeps the install and restore exemption as edited on the branch.
- **Rests on:** D-5
- **Follow-ups:** none

## D-9: Do fixed lookup tables count as hidden collaborators?

- **Status:** Owner
- **Asked by:** workflow run 20261003T093630Z-b601a0 (code_review), judge item "Package-level kind catalogs (blockable, extensions, allKinds) are read without injection"; advisor run 20261003T094142Z-091eb1 answered `owner`
- **Question:** does the hidden-collaborator rule cover fixed lookup tables?
- **Options:** (a) leave all three as they are, as constant vocabulary; (b) turn only the new blockable map into a pure lookup function, which leaves it inconsistent with the existing catalogs; (c) turn all three into pure functions, which goes beyond LAB-59 and should be its own deferred item.
- **Excluded:** (a): a package-level mutable table is a hidden collaborator under the review rule, with no exception recorded. (b): it leaves the catalogs inconsistent.
- **Decision:** (c), done in LAB-59 rather than deferred: `blockable`, `extensions` and `allKinds` become pure functions.
- **Rests on:** none
- **Follow-ups:** none

## D-10: May LAB-66 edit the recorded review prompts?

- **Status:** Owner
- **Asked by:** workflow run 20261005T120632Z-10c77a (code_review), judge item "The change rewrites six recorded review prompts that are owner-controlled"
- **Question:** do you approve the LAB-66 policy edits to the six recorded prompts (code-review-tests, -adr, -adversarial, -architecture, -clarity, -judge)?
- **Options:** (a) approve them as the intended LAB-66 change and keep them; (b) restore the recorded prompts and send the policy changes to the owner as a separate decision; (c) keep some edits and restore the rest.
- **Excluded:** (b), (c): the edits are the change the owner asked for. LAB-66 is the owner's issue, recommending the tests prompt rewrite; the owner decided that reviewers never run tests and that this rule lives in the reviewer prompts.
- **Decision:** (a). All six prompt edits stay.
- **Rests on:** none
- **Follow-ups:** none

## D-11: How Agister tells that an optional prompt is absent

- **Status:** Owner
- **Asked by:** workflow run 20261003T130421Z-aa12ef (code_review), judge item "Absence is inferred from listing membership and a name-keyed map, and each edge leaks"; advisor run 20261003T130940Z-6a1ce4 answered `owner`
- **Question:** should absence of an optional prompt stay "not in the listing" plus a name-keyed map with each edge patched, or should resolution carry a distinguishable not-found result per input?
- **Options:** (a) keep the listing inference and the name-keyed map; list matching directories, require unique input names, add a listing-error test; (b) resolution carries, per input, a distinguishable not-found result from the read path, so only a genuine not-found in both layers omits the input and no name collision can suppress a different input.
- **Excluded:** (a): it patches each edge of an inference that keeps leaking, and its unique-name rule reaches beyond ADR-019.
- **Decision:** (b).
- **Rests on:** none
- **Follow-ups:** the LAB-64 round 1 fixes: a directory at an optional prompt's path refuses the call; a duplicate input name cannot drop a present required prompt; a prompt-listing error refuses the call, each with a test.

## D-12: May LAB-67 edit the recorded review prompts?

- **Status:** Owner
- **Asked by:** workflow run 20261005T124709Z-9e1ae1 (code_review), judge item "Edits to six recorded review prompts need the owner's decision"
- **Question:** may this change revise the six recorded review prompts (five reviewers' reporting obligations and the judge's responsibilities)?
- **Options:** (a) authorize revising the six prompts as the candidate does; (b) preserve the prompts as recorded and adjust the schema changes accordingly.
- **Excluded:** (b): the prompt edits are the change. The owner approved LAB-67, whose scope is these prompts: reviewers report their definition-of-done coverage, and the judge gets a definition of done. Same question as D-10.
- **Decision:** (a). All six prompt edits stay.
- **Rests on:** D-10
- **Follow-ups:** none

## D-13: May LAB-63 edit the recorded architecture prompt and implement instructions?

- **Status:** Owner
- **Asked by:** workflow run 20261005T131604Z-25a2b5 (code_review), judge item "LAB-63 edits existing agent instructions as its brief requests"; advisor run 20261005T132214Z-bc707a answered `owner`
- **Question:** do LAB-63's two edits to existing agent instructions stay?
- **Options:** (a) they stay, and an owner decision is appended to decisions.md as D-12 did for LAB-67; (b) revert both to the recorded text and ship only the new prompts and optional inputs.
- **Excluded:** (b): the edits are the change LAB-63 asks for.
- **Decision:** (a). The architecture review prompt loses its ADR-001 rule 15 parenthesis, and the four implement instructions gain the sentence on guidance given as further inputs.
- **Rests on:** none
- **Follow-ups:** none
