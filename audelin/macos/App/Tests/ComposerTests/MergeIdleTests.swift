@testable import Composer
import Recording
import Testing
import TranscriptFinalization

struct MergeIdleTests {
    @Test func idleWhenNothingRecordsFinishesOrMakesNotes() {
        #expect(idleToMerge(recording: .idle, finishing: [], notesBusy: false))
        #expect(idleToMerge(recording: .idle, finishing: [.finalized, .failed], notesBusy: false))
    }

    @Test(arguments: [RecordingState.Phase.beginning, .recording, .ending])
    func busyWhileRecording(phase: RecordingState.Phase) {
        #expect(!idleToMerge(recording: phase, finishing: [], notesBusy: false))
    }

    @Test(arguments: [TranscriptFinalizationState<CallState, Transcript.Attributed, [TranscriptSegment]>.Stage.writing,
                      .diarizing, .cleaning, .committing])
    func busyWhileATranscriptIsBeingFinished(stage: TranscriptFinalizationState<CallState, Transcript.Attributed, [TranscriptSegment]>.Stage) {
        #expect(!idleToMerge(recording: .idle, finishing: [.finalized, stage], notesBusy: false))
    }

    @Test func busyWhileNotesAreBeingMade() {
        #expect(!idleToMerge(recording: .idle, finishing: [], notesBusy: true))
    }
}
