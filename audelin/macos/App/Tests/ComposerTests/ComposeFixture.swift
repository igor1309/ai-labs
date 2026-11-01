import BlockingTestWork
import Composer
import Foundation
import LiveText
import Observation
import PanelUI
import Preferences
import Recording
import SessionRehearsal
import Synchronization
import Testing

/// Drives the public composition with real machines, UI models and files.
@MainActor
struct ComposeFixture {
    let menu: AudelinMenu
    let root: URL
    let microphone: CaptureScript<CaptureBuffer>
    let call: CaptureScript<CaptureBuffer>
    let mine: SessionRecognizer
    let theirs: SessionRecognizer
    let selections: Values<CaptureSelection>
    let clock: FixtureClock
    let log: FixtureLog

    static func make(
        root: URL, preferences: Preferences? = nil,
        microphoneFails: Bool = false, stopFailure: ComposerSide? = nil, stopEndsStream: Bool = true,
        rates: [Double]? = nil, recognizers: (any Recognizer, any Recognizer)? = nil,
        configure: (inout ComposerBoundary) -> Void = { _ in },
        openFolder: @escaping (URL) -> Bool = { _ in false }, presentCalls: @escaping () -> Void = {},
        openURL: @escaping (URL) -> Void = { _ in }, presentPanel: @escaping (Bool) -> Void = { _ in },
        terminate: @escaping @Sendable () async -> Void = {}
    ) async throws -> Self {
        let first = rates.map { Array(repeating: Float(0), count: Int($0[0] / 100)) }
        let last = rates.map { Array(repeating: Float(0), count: Int($0[1] / 100)) }
        let microphone = CaptureScript<CaptureBuffer>(
            first: .init(samples: first ?? [0.25, -0.5], sampleRate: rates?[0] ?? 48_000),
            last: .init(samples: last ?? [0.125], sampleRate: rates?[1] ?? 48_000), fails: microphoneFails,
            stopFails: stopFailure == .microphone, stopEndsStream: stopFailure == .microphone ? stopEndsStream : true)
        let call = CaptureScript<CaptureBuffer>(
            first: .init(samples: first ?? [-0.25, 0.5], sampleRate: rates?[0] ?? 48_000),
            last: .init(samples: last ?? [-0.125], sampleRate: rates?[1] ?? 48_000), fails: false,
            stopFails: stopFailure == .call, stopEndsStream: stopFailure == .call ? stopEndsStream : true)
        let mine = SessionRecognizer(name: "mine"), theirs = SessionRecognizer(name: "theirs")
        let selections = Values<CaptureSelection>(), clock = FixtureClock(), log = FixtureLog()
        var boundary = rehearsalBoundary(capturePersistence: .recorded,
            microphone: { try microphone.start() },
            call: { selection in selections.append(selection); return try call.start() },
            mine: RehearsalRecognizer(recognizers?.0 ?? mine), theirs: RehearsalRecognizer(recognizers?.1 ?? theirs),
            now: { Date(timeIntervalSince1970: 0) }, timeZone: { .gmt }, sleep: clock.sleep,
            intervals: testIntervals)
        boundary.time = clock.time
        boundary.log = log
        configure(&boundary)
        let preferencesURL = root.appendingPathComponent("preferences.json")
        try await offPool {
            try PreferencesStore(fileURL: preferencesURL).write(preferences ?? Preferences(automaticRecording: false, liveText: true, callsFolder: root))
        }
        let menu = await compose(boundary: boundary, preferencesURL: preferencesURL,
            openCallsFolder: openFolder, presentCalls: presentCalls, openURL: openURL,
            presentPanel: presentPanel, terminate: terminate)
        return Self(menu: menu, root: root, microphone: microphone, call: call, mine: mine, theirs: theirs,
                    selections: selections, clock: clock, log: log)
    }

    func state(where matches: (RecordingState) -> Bool) async throws -> RecordingState {
        for await state in await menu.states() { if matches(state) { return state } }
        throw ScriptFailure.failed
    }

    func panel(where matches: (PanelState) -> Bool) async throws -> PanelState {
        for await state in await menu.panelStates() { if matches(state) { return state } }
        throw ScriptFailure.failed
    }

    func start() async throws {
        await menu.perform(.start)
        _ = try await state { $0.phase == .recording }
    }

    func stop() async throws {
        await menu.perform(.stop)
        _ = try await state { $0.phase == .idle }
    }

    func finish() async {
        await menu.perform(.quit)
        microphone.end(); call.end(); clock.finish()
    }

    nonisolated func folder(_ name: String = "1970.01.01-0000") -> URL { root.appendingPathComponent(name) }
}

func transcriptText(of rig: ComposeFixture, folder: String = "1970.01.01-0000") async throws -> String {
    let url = rig.folder(folder).appendingPathComponent("transcript.md")
    return try await offPool { try String(contentsOf: url, encoding: .utf8) }
}

/// A capture the test feeds itself, with no pieces but the ones it sends.
struct FedCapture: Sendable {
    let audio = AsyncThrowingStream<CaptureBuffer, any Error>.makeStream()
    var started: StartedCapture<CaptureBuffer> {
        StartedCapture(stream: audio.stream, stop: { audio.continuation.finish() })
    }
    func send(_ samples: [Float], rate: Double = 48_000) {
        audio.continuation.yield(.init(samples: samples, sampleRate: rate))
    }
    func end() { audio.continuation.finish() }
}

/// The panel's rows once it shows lines; nothing while it shows none.
func entries(of state: PanelState) -> [PanelState.Entry] {
    if case let .lines(lines) = state.log { lines.entries } else { [] }
}

@MainActor
func withComposition(
    preferences: ((URL) -> Preferences)? = nil,
    microphoneFails: Bool = false, stopFailure: ComposerSide? = nil, stopEndsStream: Bool = true,
    rates: [Double]? = nil, recognizers: (any Recognizer, any Recognizer)? = nil,
    configure: (inout ComposerBoundary) -> Void = { _ in },
    openFolder: @escaping (URL) -> Bool = { _ in false }, presentCalls: @escaping () -> Void = {},
    terminate: @escaping @Sendable () async -> Void = {},
    _ body: @MainActor (ComposeFixture) async throws -> Void
) async throws {
    try await withComposeFolder { root in
        let fixture = try await ComposeFixture.make(root: root, preferences: preferences?(root),
            microphoneFails: microphoneFails, stopFailure: stopFailure, stopEndsStream: stopEndsStream,
            rates: rates, recognizers: recognizers, configure: configure,
            openFolder: openFolder, presentCalls: presentCalls, terminate: terminate)
        do { try await body(fixture); await fixture.finish() }
        catch { await fixture.finish(); throw error }
    }
}

final class FixtureLog: LogSink {
    let entries = Values<LogEntry>()
    private let delivery = AsyncStream<LogEntry>.makeStream()
    func write(_ entry: LogEntry) { entries.append(entry); delivery.continuation.yield(entry) }
    func wait(where matches: @Sendable (LogEntry) -> Bool) async {
        if entries.all.contains(where: matches) { return }
        for await entry in delivery.stream { if matches(entry) { return } }
    }
    deinit { delivery.continuation.finish() }
}

final class FixtureClock: Sendable {
    private struct Waiter {
        let duration: Duration
        var continuation: CheckedContinuation<Void, any Error>?
    }
    private struct State {
        var now = 0.0
        var waiters: [UUID: Waiter] = [:]
        var ticks: [UUID: AsyncStream<Void>.Continuation] = [:]
    }
    private let state = Mutex(State())
    let asked = Values<Duration>()
    private let sleeping = Signal()
    var time: ComposerTime {
        ComposerTime(now: { Date(timeIntervalSince1970: 0) }, timeZone: { .gmt },
            monotonicNow: { self.state.withLock { $0.now } }, sleep: sleep,
            after: { _, _ in BoundaryCancellation {} }, ticks: ticks)
    }
    func sleep(_ duration: Duration) async throws {
        let id = UUID()
        state.withLock { $0.waiters[id] = Waiter(duration: duration) }
        defer { _ = state.withLock { $0.waiters.removeValue(forKey: id) } }
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                let registered = state.withLock { state in
                    guard state.waiters[id] != nil else { return false }
                    state.waiters[id]?.continuation = continuation
                    return true
                }
                if registered { asked.append(duration); sleeping.send() }
                else { continuation.resume(throwing: CancellationError()) }
            }
        } onCancel: {
            let waiter = self.state.withLock { $0.waiters.removeValue(forKey: id) }
            waiter?.continuation?.resume(throwing: CancellationError())
        }
    }
    func waitForSleep(_ duration: Duration) async {
        while !asked.all.contains(duration) { await sleeping.next() }
    }
    func wake(_ duration: Duration) {
        let continuations = state.withLock { state in
            let matching = state.waiters.filter { $0.value.duration == duration && $0.value.continuation != nil }
            for id in matching.keys { state.waiters.removeValue(forKey: id) }
            return matching.values.compactMap(\.continuation)
        }
        for continuation in continuations { continuation.resume() }
    }
    func ticks() -> AsyncStream<Void> {
        let id = UUID()
        let pair = AsyncStream<Void>.makeStream()
        state.withLock { $0.ticks[id] = pair.continuation }
        pair.continuation.onTermination = { _ in _ = self.state.withLock { $0.ticks.removeValue(forKey: id) } }
        return pair.stream
    }
    func advance(_ seconds: Double) {
        let ticks = state.withLock { state in state.now += seconds; return Array(state.ticks.values) }
        for output in ticks { output.yield(()) }
    }
    func finish() {
        let previous = state.withLock { state in let previous = state; state.waiters = [:]; state.ticks = [:]; return previous }
        for waiter in previous.waiters.values { waiter.continuation?.resume(throwing: CancellationError()) }
        for tick in previous.ticks.values { tick.finish() }
        sleeping.end()
    }
}
