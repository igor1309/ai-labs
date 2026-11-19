# Re-recognition — QA

A plain component driven through fake ports: a hear port that reports
fractions and returns scripted rows, a split port, a clean port, an old
transcript read, Name carry's fake, and a publish spy that records the
transcript it gets. Each fake can be held at a gate or made to fail.
Expected transcripts are built as values independently of the component.

## S-1 A call is made in order

Each stage returns marked data: the split port gets the heard far side, the clean port the heard microphone side, and the publish spy gets both stages' outputs and an origin naming this build's hearing, split and cleaning.
Evidence: Missing.

## S-2 Preparing is reported first

Hold the hear port's load: preparing is reported, no fraction before the gate opens.
Evidence: Missing.

## S-3 One fraction over every track

Two original calls: every fraction precedes the first split call; hold the first split and assert no finishing before both originals' hearing ended; finishing is reported from the first split until publish returns.
Evidence: Missing.

## S-4 A split that keeps nothing still publishes

Split keeps nothing, and in a second run the split port throws: the far side is one speaker; the origin says the split kept nothing.
Evidence: Missing.

## S-5 A clean that keeps nothing still publishes

Clean keeps nothing, and in a second run the clean port throws: the microphone side as heard; the origin says cleaning kept nothing.
Evidence: Missing.

## S-6 Carried names are published

Name carry's fake names new speaker A: the published A carries it. On a merged call whose current transcript dropped a name its archived part still has, the fake gets only the current transcript's speakers, cut per original call's span.
Evidence: Missing.

## S-7 A track that cannot be heard fails

The hear port throws on one track: no publish; the failure carries the reason.
Evidence: Missing.

## S-8 A merged call names the failing call

A merge of a merge, the innermost call's hear throws: no publish; the failure names that call.
Evidence: Missing.

## S-9 Original calls are joined

A merge of a merge of three calls: each original call once, in order, with new words, each gap, a new origin per call and this build as merger.
Evidence: Missing.

## S-10 Stopping publishes nothing

Hold hearing, ask stop, release: no publish; stopped only after the hear returns. Same at the split and the clean gates.
Evidence: Missing.

## S-11 A failed publish fails

The old transcript read throws: the publish spy gets a transcript with no carried names; Name carry's fake got no old speakers.
Evidence: Missing.

## S-12 The models fail to load

The publish spy throws: the run fails with its reason.
Evidence: Missing.

## S-13 A stop during publishing reports made

The hear port fails while loading: no publish; the failure carries the reason.
Evidence: Missing.

## S-14 No old transcript carries no names

Hold the publish, ask stop, release success: made is reported, not stopped.
Evidence: Missing.
