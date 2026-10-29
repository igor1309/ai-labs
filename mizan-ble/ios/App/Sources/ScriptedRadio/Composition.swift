import Foundation
import Dispatch
import Root
import ScriptedSettings

@MainActor public func scriptedRadios(settingsPath: String, log: any LogSink) -> RadioPair {
    scriptedRadios(source: SettingsLoader(path: settingsPath, changes: DirectoryChanges()), clock: RealtimeClock(), log: log)
}

@MainActor func scriptedRadios(source: any SettingsSource, clock: any RadioClock, log: any LogSink) -> RadioPair {
    let settings = SettingsRelay(source: source, log: log)
    return RadioPair(host: ScriptedHost(source: settings, clock: clock), client: ScriptedClient(
        source: settings, clock: clock, sealMessage: { try Wire.seal($0, with: $1) }
    ))
}

/// One file subscription fans out to both ports and owns per-change diagnostics.
@MainActor private final class SettingsRelay: SettingsSource {
    private let source: any SettingsSource
    private let log: any LogSink
    private var outputs: [UUID: AsyncStream<SettingsResult>.Continuation] = [:]
    private var task: Task<Void, Never>?

    init(source: any SettingsSource, log: any LogSink) {
        self.source = source; self.log = log
        record(source.current())
        let updates = source.updates
        task = Task.immediate { [weak self] in
            for await result in updates {
                guard let self else { return }
                record(result)
                for output in outputs.values { output.yield(result) }
            }
        }
    }
    func current() -> SettingsResult { source.current() }
    var updates: AsyncStream<SettingsResult> {
        let id = UUID()
        let (stream, output) = AsyncStream<SettingsResult>.makeStream()
        outputs[id] = output
        output.onTermination = { [weak self] _ in
            Task { @MainActor [weak self] in self?.outputs.removeValue(forKey: id) }
        }
        return stream
    }
    private func record(_ result: SettingsResult) {
        switch result {
        case .valid: break
        case .unavailable(kind: .missing): log.write(.rehearsal("missing"))
        case .unavailable(kind: .invalid): log.write(.rehearsal("invalid"))
        }
    }
    isolated deinit { task?.cancel(); for output in outputs.values { output.finish() } }
}

@MainActor private final class RealtimeClock: RadioClock {
    private let origin = ContinuousClock.now
    var now: Double {
        let elapsed = origin.duration(to: ContinuousClock.now).components
        return Double(elapsed.seconds) + Double(elapsed.attoseconds) / 1e18
    }
    func schedule(after seconds: Double, _ action: @escaping @MainActor () -> Void) -> any ScheduledStep {
        TimerStep(seconds: seconds, action: action)
    }
}

@MainActor private final class TimerStep: ScheduledStep {
    private let timer: any DispatchSourceTimer
    init(seconds: Double, action: @escaping @MainActor () -> Void) {
        let timer = DispatchSource.makeTimerSource(queue: .main)
        self.timer = timer
        timer.schedule(deadline: .now() + seconds)
        timer.setEventHandler { [weak self] in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.timer.cancel()
                action()
            }
        }
        timer.resume()
    }
    func cancel() { timer.cancel() }
    isolated deinit { timer.cancel() }
}
