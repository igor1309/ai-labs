import AVFoundation
import CallAudioAccess
import Composer
import struct CoreAudioProcesses.CoreAudioBinding
import struct CoreAudioProcesses.ContinuousCallClock
import Foundation
import LiveText
import ParakeetRecognizer

func makeRealBoundary() async -> ComposerBoundary {
    let access = await makeCallAudioAccess()
    return ComposerBoundary(
        capturePersistence: .recorded,
        microphone: RealMicrophone(), callAudio: RealCallAudio(), recognizers: RealRecognizerSource(log: SystemLogSink()),
        processes: RealProcessSource(), access: RealCallAudioAccess(policy: access),
        microphonePermission: SystemMicrophonePermission(), capacity: DiskCapacity(), time: RealClock(), log: SystemLogSink(), intervals: .systemIntervals
    )
}

struct RealCallAudioAccess: CallAudioAccessSource {
    let policy: AccessPolicy
    var refresh: @Sendable () async -> Bool { policy.refresh }
    var reserve: @Sendable () async -> Bool { policy.reserve }
    var release: @Sendable () async -> Void { policy.release }
    var invalidate: @Sendable () async -> Void { policy.invalidate }
    var states: @Sendable () async -> AsyncStream<Bool> {
        { [policy] in
            let states = await policy.states()
            return AsyncStream { output in
                let task = Task {
                    for await state in states { output.yield(state.published) }
                    output.finish()
                }
                output.onTermination = { _ in task.cancel() }
            }
        }
    }
}
struct RealClock: ComposerClock {
    private let base = realTime()
    var now: @Sendable () -> Date { base.now }
    var timeZone: @Sendable () -> TimeZone { base.timeZone }
    var monotonicNow: @Sendable () -> Double { base.monotonicNow }
    var sleep: @Sendable (Duration) async throws -> Void { base.sleep }
    var after: @Sendable (Duration, @escaping @Sendable () -> Void) -> BoundaryCancellation { base.after }
    var ticks: @Sendable () -> AsyncStream<Void> { base.ticks }
}

struct RealMicrophone: MicrophoneSource {
    func start() async throws -> StartedCapture<CaptureBuffer> { try await startProductionMicrophone() }
}
struct RealCallAudio: CallAudioSource {
    func start(_ selection: CaptureSelection) async throws -> StartedCapture<CaptureBuffer> {
        try await startProductionCallAudio(selection)
    }
}
struct RealRecognizerSource: RecognizerSource {
    let log: any LogSink
    func recognizer(for side: ComposerSide) async throws -> any SpeechRecognizer {
        RealRecognizer(base: try await ParakeetRecognizer())
    }
    func missingModels() -> [String] { ParakeetRecognizer.missingModels(in: ParakeetRecognizer.modelsDirectory) }
    func startLoading() -> Task<Void, any Error> {
        loadModel(recognizerSource: { try await ParakeetRecognizer() }, sink: log)
    }

}
struct SystemMicrophonePermission: MicrophonePermission {
    func authorized() -> Bool { AVCaptureDevice.authorizationStatus(for: .audio) == .authorized }
    func request() async { _ = await AVCaptureDevice.requestAccess(for: .audio) }
}
struct DiskCapacity: FolderCapacity {
    func available(at folder: URL) -> Int64? {
        try? folder.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
            .volumeAvailableCapacityForImportantUsage
    }
}

struct RealProcessSource: CallProcessSource {
    private let binding = CoreAudioBinding()
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

struct RealRecognizer: SpeechRecognizer {
    let base: any Recognizer
    func hear(_ audio: SpeechAudio) async throws -> SpeechHearing {
        map(try await base.hear(AudioChunk(samples: audio.samples, sampleRate: audio.sampleRate)))
    }
    func finish() async throws -> SpeechHearing { map(try await base.finish()) }
    private func map(_ hearing: Hearing) -> SpeechHearing {
        SpeechHearing(words: hearing.words.map { SpeechWord($0.text, start: $0.start, end: $0.end) },
                      from: hearing.from, finalThrough: hearing.finalThrough, noWordBefore: hearing.noWordBefore)
    }
}

func realTime() -> ComposerTime {
    ComposerTime(now: { Date() }, timeZone: { .current },
                 monotonicNow: { ProcessInfo.processInfo.systemUptime },
                 sleep: { try await ContinuousClock().sleep(for: $0) }, after: { delay, fire in
        let token = ContinuousCallClock().after(delay, fire)
        return BoundaryCancellation { token.cancel() }
    }, ticks: {
        AsyncStream { output in
            let task = Task {
                let clock = ContinuousClock()
                var next = clock.now
                do {
                    while true {
                        next += .seconds(1)
                        try await clock.sleep(until: next)
                        output.yield(())
                    }
                } catch {}
                output.finish()
            }
            output.onTermination = { _ in task.cancel() }
        }
    })
}
