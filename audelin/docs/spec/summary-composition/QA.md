# Coordinate notes and recording — QA

Planned tests; evidence is Missing until execution. Ordering uses handshakes, never sleeps.

## S-1 Wait for final write

Missing — planned `cd audelin/macos/App && swift test --filter SummaryCompositionTests/waitforfinalwrite`. Setup fixture: the final transcript write is held; drive: call end arrives; read-back oracle: I cannot dispatch notes until the successful write and close finish. Drive shipped composition with fake call app/captures, a held final-write/dispatch/cleanup/move boundary as named, and temporary real storage; inspect ordering and next-call readiness.

## S-2 Accept recovered write

Missing — planned `cd audelin/macos/App && swift test --filter SummaryCompositionTests/acceptrecoveredwrite`. Setup fixture: an earlier write failed but the latest final write succeeds; drive: the transcript closes; read-back oracle: I can dispatch notes for its actual spoken entries. Drive shipped composition with fake call app/captures, a held final-write/dispatch/cleanup/move boundary as named, and temporary real storage; inspect ordering and next-call readiness.

## S-3 Reject stale saved text

Missing — planned `cd audelin/macos/App && swift test --filter SummaryCompositionTests/rejectstalesavedtext`. Setup fixture: the final write failed after an older write succeeded; drive: the transcript closes; read-back oracle: I cannot dispatch notes from the stale file. Drive shipped composition with fake call app/captures, a held final-write/dispatch/cleanup/move boundary as named, and temporary real storage; inspect ordering and next-call readiness.

## S-4 Start another call

Missing — planned `cd audelin/macos/App && swift test --filter SummaryCompositionTests/startanothercall`. Setup fixture: an earlier summary request is held; drive: another call begins; read-back oracle: I can start recording without waiting for generation. Drive shipped composition with fake call app/captures, a held final-write/dispatch/cleanup/move boundary as named, and temporary real storage; inspect ordering and next-call readiness.

## S-5 Quit joins cleanup

Missing — planned `cd audelin/macos/App && swift test --filter SummaryCompositionTests/quitjoinscleanup`. Setup fixture: a generation request is active; drive: the app quits; read-back oracle: I can terminate after cancellation cleanup without fallback. Drive shipped composition with fake call app/captures, a held final-write/dispatch/cleanup/move boundary as named, and temporary real storage; inspect ordering and next-call readiness.

## S-6 Quit during handoff

Missing — planned `cd audelin/macos/App && swift test --filter SummaryCompositionTests/quitduringhandoff`. Setup fixture: recording is ending when quit stops dispatch; drive: final text becomes eligible; read-back oracle: I can retain pending work without beginning a request during shutdown. Drive shipped composition with fake call app/captures, a held final-write/dispatch/cleanup/move boundary as named, and temporary real storage; inspect ordering and next-call readiness.

## S-7 Complete during folder move

Missing — planned `cd audelin/macos/App && swift test --filter SummaryCompositionTests/completeduringfoldermove`. Setup fixture: a calls-folder move is copying a call; drive: notes finish; read-back oracle: I can read one complete result in the moved call. Drive shipped composition with fake call app/captures, a held final-write/dispatch/cleanup/move boundary as named, and temporary real storage; inspect ordering and next-call readiness.
