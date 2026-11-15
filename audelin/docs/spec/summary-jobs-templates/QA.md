# Summary jobs, templates — QA

Each row is a reducer test paired with its effect test
(`assert(state, event, delivers:)` and `expect(sut, with:, toDeliver:)`),
driven through fake ports and a fake clock.

## S-1 Make notes with a chosen template

Reducer: idle call + generate (call, Daily) → preparing with Daily, effect
resolve Daily. Effect: resolve Daily delivers the resolved template; the end
state's completion reads Daily. Evidence: Missing.

## S-2 Make notes again after success

Reducer: succeeded call + generate → preparing, effect resolve. Effect: as
S-1. Evidence: Missing.

## S-3 One run at a time

Reducer: running call + generate → same state, no effect. Effect: none
delivered; fake runtime counts no request. Evidence: Missing.

## S-4 Automatic notes use Default

Reducer: final transcript with notes on → preparing with Default. Effect:
resolve Default delivers the template. Evidence: Missing.

## S-5 Keeping on rotates

Reducer: notes made with keep on captured → effect commit with rotation.
Effect: fake storage records rotation and delivers published. Evidence: Missing.

## S-6 Keeping off replaces

Reducer and effect as S-5 with keep off → commit with replacement.
Evidence: Missing.

## S-7 A later toggle does not change a run

Reducer: captured keep on, then keep-change event → captured value
unchanged; commit with rotation. Effect: as S-5. Evidence: Missing.

## S-8 A failure keeps the published notes

Reducer: running + notes failed → failed, effect discard attempt, no commit.
Effect: discard delivers discarded; fake storage pair unchanged. Evidence: Missing.

## S-9 Cancelling keeps the published notes

Reducer: running + cancel → cancelling, effect cancel; then ended, effect
discard. Effect: fake storage pair unchanged. Evidence: Missing.

## S-10 A template that cannot be resolved

Reducer: preparing + resolution failed → failed with its reason, no claim.
Effect: resolve delivers missing; fake runtime counts no request. Evidence: Missing.

## S-11 Recovery uses the saved template

Reducer: load with a pending Daily record → pending with saved Daily, no
resolve effect. Effect: generate delivers a request with the saved
instructions though the fake folder's Daily changed. Evidence: Missing.
