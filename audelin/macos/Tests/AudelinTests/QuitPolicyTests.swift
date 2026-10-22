@testable import Audelin
import Testing

/// Quit QA scenarios (`docs/spec/quit/QA.md`), the decision only.
@Suite struct QuitPolicyTests {
    @Test func s1QuittingWithNothingRunning() {
        #expect(QuitPolicy.answer(recording: false, moving: false) == .quit)
    }

    @Test func s2QuittingDuringARecordingAsksFirst() {
        #expect(QuitPolicy.answer(recording: true, moving: false) == .confirm)
    }

    @Test func s5QuittingDuringAFolderMoveAsksFirst() {
        #expect(QuitPolicy.answer(recording: false, moving: true) == .confirm)
    }

    /// Catch-up is neither: its audio is on disk, so nothing is lost.
    @Test func s7QuittingWhileACallsTextCatchesUp() {
        #expect(QuitPolicy.answer(recording: false, moving: false) == .quit)
    }
}
