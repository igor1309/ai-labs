import CoreAudio
import Foundation
import Synchronization
import Testing
@testable import SystemAudioCapture

struct NativeStartDeadlineTests {

    /// Each case: polls that find no process object, the clock step per pause,
    /// and the refused starts expected before the 30 s deadline stops retrying.
    @Test(arguments: [(0, 1, 30), (0, 31, 1), (20, 1, 10)])
    func contractStartStopsRetryingAtTheSharedDeadline(missingPolls: Int, step: Int, refusals: Int) async throws {

        let calls = RecordingCaptureCalls(format: .float32MonoLittleEndian)
        if missingPolls > 0 { calls.state.withLock { $0.missing = 10 } }
        var native = calls.native
        let attempts = Mutex(0)
        native.createTap = { _, _ in
            attempts.withLock { $0 += 1 }
            return kAudioHardwareBadObjectError
        }
        let start = ContinuousClock.now
        let elapsed = Mutex(Duration.zero)
        let pauses = Mutex(0)
        let attemptsAtExpiry = Mutex<Int?>(nil)
        do {
            let capture = try await CoreAudioBindingTests().start(
                10, binding: CoreAudioBinding(native: native),
                pause: {
                    // A retry past the deadline fails here instead of looping forever.
                    if elapsed.withLock({ $0 }) >= .seconds(30) { throw CancellationError() }
                    let paused = pauses.withLock { $0 += 1; return $0 }
                    if paused == missingPolls { calls.state.withLock { $0.missing = nil } }
                    elapsed.withLock {
                        $0 += .seconds(step)
                        if $0 >= .seconds(30), attemptsAtExpiry.withLock({ $0 }) == nil {
                            attemptsAtExpiry.withLock { $0 = attempts.withLock { $0 } }
                        }
                    }
                },
                now: { start + elapsed.withLock { $0 } }
            )
            capture.stop()
            Issue.record("A start refused past the deadline must throw")
        } catch {
            #expect((error as NSError).domain == NSOSStatusErrorDomain)
            #expect((error as NSError).code == Int(kAudioHardwareBadObjectError))
        }
        #expect(attempts.withLock { $0 } == refusals)
        #expect(attemptsAtExpiry.withLock { $0 } == refusals, "No start may follow the deadline")
    }
}
