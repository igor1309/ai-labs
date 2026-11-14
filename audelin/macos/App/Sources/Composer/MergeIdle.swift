import CallNames
import Recording
import TranscriptFinalization

/// Audelin is idle enough to merge calls: nothing is recording, no transcript is
/// being finished and no notes are being made.
func idleToMerge(recording: RecordingState.Phase, finishing: [TranscriptFinalizationState<CallState, CallNamesState, Transcript.Attributed, [TranscriptSegment]>.Stage],
                 notesBusy: Bool) -> Bool {
    recording == .idle && !notesBusy && finishing.allSatisfy { $0 == .finalized || $0 == .failed }
}
