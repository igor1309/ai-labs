import Composer
import CoreAudioProcesses
import Foundation
import SessionRehearsal
import Synchronization

struct FixtureMicrophone: MicrophoneSource {
    let begin: @Sendable () async throws -> StartedCapture<CaptureBuffer>
    func start() async throws -> StartedCapture<CaptureBuffer> { try await begin() }
}
struct FixtureCallAudio: CallAudioSource {
    let begin: @Sendable (CaptureSelection) async throws -> StartedCapture<CaptureBuffer>
    func start(_ selection: CaptureSelection) async throws -> StartedCapture<CaptureBuffer> { try await begin(selection) }
}
struct FixtureRecognizers: RecognizerSource {
    let source: @Sendable (ComposerSide) async throws -> any SpeechRecognizer
    let missing: @Sendable () -> [String]
    let load: @Sendable () -> Task<Void, any Error>
    func recognizer(for side: ComposerSide) async throws -> any SpeechRecognizer { try await source(side) }
    func missingModels() -> [String] { missing() }
    func startLoading() -> Task<Void, any Error> { load() }
}
struct FixtureProcesses: CallProcessSource {
    let binding: any ProcessBinding
    func processObjects() throws -> [UInt32] { try binding.processObjects() }
    func pid(of object: UInt32) -> Int32? { binding.pid(of: object) }
    func bundleID(of object: UInt32) -> String? { binding.bundleID(of: object) }
    func name(of object: UInt32) -> String { binding.name(of: object) }
    func isRunningInput(_ object: UInt32) -> Bool { binding.isRunningInput(object) }
    func onProcessListChange(_ changed: @escaping @Sendable () -> Void) throws -> BoundaryCancellation {
        let token = try binding.onProcessListChange(changed)
        return BoundaryCancellation { token.cancel() }
    }
    func onProcessChange(_ object: UInt32, _ changed: @escaping @Sendable () -> Void) throws -> BoundaryCancellation {
        let token = try binding.onProcessChange(object, changed)
        return BoundaryCancellation { token.cancel() }
    }
}
struct FixturePermission: MicrophonePermission {
    let status: @Sendable () -> Bool
    let prompt: @Sendable () async -> Void
    func authorized() -> Bool { status() }
    func request() async { await prompt() }
}
struct FixtureCapacity: FolderCapacity {
    let read: @Sendable (URL) -> Int64?
    func available(at folder: URL) -> Int64? { read(folder) }
}

/// Keeps each delay the composition schedules until the test fires it.
final class FixtureDeadlines: Sendable {
    private let pending = Mutex<[@Sendable () -> Void]>([])
    private let scheduled = Signal()

    func time(over base: any ComposerClock) -> ComposerTime {
        ComposerTime(now: base.now, timeZone: base.timeZone, monotonicNow: base.monotonicNow, sleep: base.sleep,
                     after: { _, fire in
                         self.pending.withLock { $0.append(fire) }
                         self.scheduled.send()
                         return BoundaryCancellation {}
                     }, ticks: base.ticks)
    }

    /// Waits until a delay is scheduled, then fires every one scheduled so far.
    func fire() async {
        while pending.withLock({ $0.isEmpty }) { await scheduled.next() }
        let fires = pending.withLock { pending in defer { pending.removeAll() }; return pending }
        for fire in fires { fire() }
    }

    func end() { scheduled.end() }
}
