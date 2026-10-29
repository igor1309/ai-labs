import Dispatch
import AVFoundation
import Foundation
import Recording
import Synchronization

public final class RecordingConditions: Sendable {

    private let checks: [(RecordingCondition, @Sendable () -> Bool)]
    private let send: @Sendable (RecordingEvent) async -> Void
    private let lastSent = Mutex<[RecordingCondition: Bool]>([:])
    private let turn = Turn()
    // The checks read the disk and access status, which block, so they run here.
    private let checking = DispatchQueue(label: "audelin.RecordingConditions")

    public convenience init(
        recording: RecordingInputs,
        microphoneAccess: @escaping @Sendable () -> Bool,
        callAudioAccess: @escaping @Sendable () -> Bool,
        callsFolder: @escaping @Sendable () -> Bool,
        room: @escaping @Sendable () -> Bool
    ) {

        self.init(
            send: recording.send,
            microphoneAccess: microphoneAccess, callAudioAccess: callAudioAccess,
            callsFolder: callsFolder, room: room, sink: SystemLogSink()
        )
    }

    // The delivery seam exposes events that Recording may reduce without a state change.
    init(
        send: @escaping @Sendable (RecordingEvent) async -> Void,
        microphoneAccess: @escaping @Sendable () -> Bool,
        callAudioAccess: @escaping @Sendable () -> Bool,
        callsFolder: @escaping @Sendable () -> Bool,
        room: @escaping @Sendable () -> Bool,
        sink: any LogSink
    ) {

        self.send = { event in
            logCondition(event, sink: sink)
            await send(event)
        }
        checks = [
            (.microphoneAccess, microphoneAccess), (.callAudioAccess, callAudioAccess),
            (.callsFolder, callsFolder), (.room, room),
        ]
    }

    /// Refreshes run one at a time, so their sends reach Recording in the order they were read.
    public func refresh() async {

        await turn.take()
        let checks = checks
        let readings = await withCheckedContinuation { (done: CheckedContinuation<[(RecordingCondition, Bool)], Never>) in
            checking.async { done.resume(returning: checks.map { ($0.0, $0.1()) }) }
        }
        let changes = lastSent.withLock { previous in
            readings.compactMap { condition, available -> RecordingEvent? in
                guard previous[condition] != available else { return nil }
                previous[condition] = available
                return .conditionChanged(condition, available: available)
            }
        }
        for change in changes { await send(change) }
        turn.give()
    }
}

/// A first-come lock that an async holder keeps across its awaits.
private final class Turn: Sendable {

    private struct State {

        var taken = false
        var waiting: [CheckedContinuation<Void, Never>] = []
    }
    private let state = Mutex(State())

    func take() async {

        await withCheckedContinuation { (waiter: CheckedContinuation<Void, Never>) in
            let granted = state.withLock { state in
                guard state.taken else {
                    state.taken = true
                    return true
                }
                state.waiting.append(waiter)
                return false
            }
            if granted { waiter.resume() }
        }
    }

    func give() {

        let next = state.withLock { state -> CheckedContinuation<Void, Never>? in
            guard !state.waiting.isEmpty else {
                state.taken = false
                return nil
            }
            return state.waiting.removeFirst()
        }
        next?.resume()
    }
}

public func composeRecordingConditions(recording: RecordingInputs, callsURL: URL) -> RecordingConditions {

    RecordingConditions(
        recording: recording,
        microphoneAccess: { AVCaptureDevice.authorizationStatus(for: .audio) == .authorized },
        // Process taps have no access status, and a denied tap gives silence (LAB-604).
        callAudioAccess: { true },
        callsFolder: {
            isCallsDirectory(callsURL) && FileManager.default.isWritableFile(atPath: callsURL.path)
        },
        room: {
            callsFolderHasRoom(at: callsURL, availableCapacity: { url in
                try? url.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
                    .volumeAvailableCapacityForImportantUsage
            })
        }
    )
}

func callsFolderHasRoom(at url: URL, availableCapacity: @Sendable (URL) -> Int64?) -> Bool {

    guard isCallsDirectory(url), let bytes = availableCapacity(url) else { return false }
    return bytes >= 30 * 1_000_000_000
}

private func isCallsDirectory(_ url: URL) -> Bool {

    var directory: ObjCBool = false
    return FileManager.default.fileExists(atPath: url.path, isDirectory: &directory) && directory.boolValue
}

func logCondition(_ event: RecordingEvent, sink: any LogSink) {

    if case let .conditionChanged(condition, available) = event {
        sink.write(.init(category: .conditions, message: "condition=\(condition) available=\(available)"))
    }
}
