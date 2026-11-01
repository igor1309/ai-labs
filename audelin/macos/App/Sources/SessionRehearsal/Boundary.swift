import Composer
import Foundation
import LiveText
import Preferences

public struct RehearsalRecognizer: SpeechRecognizer {
    private let base: any Recognizer
    public init(_ base: any Recognizer) { self.base = base }
    public func hear(_ audio: SpeechAudio) async throws -> SpeechHearing {
        map(try await base.hear(AudioChunk(samples: audio.samples, sampleRate: audio.sampleRate)))
    }
    public func finish() async throws -> SpeechHearing { map(try await base.finish()) }
    private func map(_ hearing: Hearing) -> SpeechHearing {
        SpeechHearing(words: hearing.words.map { SpeechWord($0.text, start: $0.start, end: $0.end) },
                      from: hearing.from, finalThrough: hearing.finalThrough, noWordBefore: hearing.noWordBefore)
    }
}

/// Synthetic inputs use the same composition as the executable, including its file writers.
public func rehearsalBoundary(
    capturePersistence: CapturePersistence,
    microphone: @escaping @Sendable () async throws -> StartedCapture<CaptureBuffer>,
    call: @escaping @Sendable (CaptureSelection) async throws -> StartedCapture<CaptureBuffer>,
    mine: any SpeechRecognizer, theirs: any SpeechRecognizer,
    now: @escaping @Sendable () -> Date, timeZone: @escaping @Sendable () -> TimeZone,
    sleep: @escaping @Sendable (Duration) async throws -> Void,
    intervals: ProfileIntervals
) -> ComposerBoundary {
    ComposerBoundary(capturePersistence: capturePersistence, microphone: RehearsalMicrophone(startCapture: microphone),
        callAudio: RehearsalCallAudio(startCapture: call),
        recognizers: RehearsalRecognizers(mine: mine, theirs: theirs), processes: RehearsalProcesses(),
        access: ComposerAccess(refresh: { true }, reserve: { true }, release: {},
                               states: { AsyncStream { $0.yield(true); $0.finish() } }, invalidate: {}),
        microphonePermission: RehearsalPermission(), capacity: RehearsalCapacity(),
        time: ComposerTime(now: now, timeZone: timeZone, monotonicNow: { ProcessInfo.processInfo.systemUptime },
                           sleep: sleep, after: { delay, fire in
            let task = Task { do { try await sleep(delay); fire() } catch {} }
            return BoundaryCancellation { task.cancel() }
        }, ticks: {
            AsyncStream { output in
                let task = Task {
                    do {
                        while true { try await sleep(.seconds(1)); output.yield(()) }
                    } catch {}
                    output.finish()
                }
                output.onTermination = { _ in task.cancel() }
            }
        }), log: RehearsalLog(), intervals: intervals)
}

private struct RehearsalMicrophone: MicrophoneSource {
    let startCapture: @Sendable () async throws -> StartedCapture<CaptureBuffer>
    func start() async throws -> StartedCapture<CaptureBuffer> { try await startCapture() }
}
private struct RehearsalCallAudio: CallAudioSource {
    let startCapture: @Sendable (CaptureSelection) async throws -> StartedCapture<CaptureBuffer>
    func start(_ selection: CaptureSelection) async throws -> StartedCapture<CaptureBuffer> { try await startCapture(selection) }
}
private struct RehearsalRecognizers: RecognizerSource {
    let mine: any SpeechRecognizer
    let theirs: any SpeechRecognizer
    func recognizer(for side: ComposerSide) -> any SpeechRecognizer {
        switch side { case .microphone: mine; case .call: theirs }
    }
    func missingModels() -> [String] { [] }
    func startLoading() -> Task<Void, any Error> { Task {} }
}
private struct RehearsalPermission: MicrophonePermission {
    func authorized() -> Bool { true }
    func request() async {}
}
private struct RehearsalCapacity: FolderCapacity {
    func available(at folder: URL) -> Int64? { Int64.max }
}

private struct RehearsalProcesses: CallProcessSource {
    func processObjects() -> [UInt32] { [] }
    func pid(of object: UInt32) -> Int32? { nil }
    func bundleID(of object: UInt32) -> String? { nil }
    func name(of object: UInt32) -> String { "" }
    func isRunningInput(_ object: UInt32) -> Bool { false }
    func onProcessListChange(_ changed: @escaping @Sendable () -> Void) -> BoundaryCancellation { BoundaryCancellation {} }
    func onProcessChange(_ object: UInt32, _ changed: @escaping @Sendable () -> Void) -> BoundaryCancellation { BoundaryCancellation {} }
}

@MainActor
public func startRehearsal(boundary: ComposerBoundary, root: URL) async throws -> AudelinMenu {
    let url = root.appendingPathComponent("preferences.json")
    try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, any Error>) in
        DispatchQueue(label: "audelin.rehearsal.preferences").async {
            done.resume(with: Result {
                try PreferencesStore(fileURL: url).write(Preferences(automaticRecording: false, liveText: true, callsFolder: root))
            })
        }
    }
    let composition = await compose(boundary: boundary, preferencesURL: url,
        openCallsFolder: { _ in false }, presentCalls: {}, openURL: { _ in }, presentPanel: { _ in }, terminate: {})
    await composition.perform(.start)
    for await state in await composition.states() {
        if state.phase == .recording { return composition }
        if let reason = state.cannotRecord { throw RehearsalFailure.cannotRecord(reason) }
    }
    throw RehearsalFailure.ended
}
private enum RehearsalFailure: Error { case cannotRecord(String), ended }
