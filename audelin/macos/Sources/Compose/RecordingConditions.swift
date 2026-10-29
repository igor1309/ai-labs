import Dispatch
import AVFoundation
import Foundation
import Recording
import Synchronization
import CallAudioAccess

public final class RecordingConditions: Sendable {

    private let checks: [(RecordingCondition, @Sendable () -> Bool)]
    private let send: @Sendable (RecordingEvent) async -> Void
    private let lastSent = Mutex<[RecordingCondition: Bool]>([:])
    private let turn = Turn()
    private let access: AccessPolicy?
    private let observation = Mutex<Task<Void, Never>?>(nil)
    // The checks read the disk and access status, which block, so they run here.
    private let checking = DispatchQueue(label: "audelin.RecordingConditions")

    public convenience init(
        recording: RecordingInputs,
        microphoneAccess: @escaping @Sendable () -> Bool,
        callAudioAccess: @escaping @Sendable () -> Bool,
        callsFolder: @escaping @Sendable () -> Bool,
        room: @escaping @Sendable () -> Bool,
        access: AccessPolicy? = nil
    ) {

        self.init(
            send: recording.send,
            microphoneAccess: microphoneAccess, callAudioAccess: callAudioAccess,
            callsFolder: callsFolder, room: room, sink: SystemLogSink(), access: access
        )
    }

    // The delivery seam exposes events that Recording may reduce without a state change.
    init(
        send: @escaping @Sendable (RecordingEvent) async -> Void,
        microphoneAccess: @escaping @Sendable () -> Bool,
        callAudioAccess: @escaping @Sendable () -> Bool,
        callsFolder: @escaping @Sendable () -> Bool,
        room: @escaping @Sendable () -> Bool,
        sink: any LogSink,
        access: AccessPolicy? = nil
    ) {

        self.access = access
        self.send = { event in
            logCondition(event, sink: sink)
            await send(event)
        }
        checks = [
            (.microphoneAccess, microphoneAccess), (.callAudioAccess, callAudioAccess),
            (.callsFolder, callsFolder), (.room, room),
        ]
        if let access {
            observation.withLock { $0 = Task { [weak self] in
                for await _ in await access.states() {
                    await self?.publishAccess()
                }
            } }
        }
    }

    /// Measurements may be shared; condition reads and delivery remain ordered.
    public func refresh() async {

        let available = await access?.refresh()
        await turn.take()
        await readConditions(available: available)
        turn.give()
    }

    private func readConditions(available: Bool?) async {

        let checks = checks
        var readings = await withCheckedContinuation { (done: CheckedContinuation<[(RecordingCondition, Bool)], Never>) in
            checking.async { done.resume(returning: checks.map { ($0.0, $0.1()) }) }
        }
        var available = available
        if let access {
            for await state in await access.states() { available = state.available; break }
        }
        if let available { readings = readings.map { ($0.0, $0.0 == .callAudioAccess ? available : $0.1) } }
        let changes = lastSent.withLock { previous in
            readings.compactMap { condition, available -> RecordingEvent? in
                guard previous[condition] != available else { return nil }
                previous[condition] = available
                return .conditionChanged(condition, available: available)
            }
        }
        for change in changes { await send(change) }
    }

    private func publishAccess() async {
        await turn.take()
        var available = false
        if let access {
            for await state in await access.states() {
                available = state.available
                break
            }
        }
        let changed = lastSent.withLock { values in
            let changed = values[.callAudioAccess] != available
            values[.callAudioAccess] = available
            return changed
        }
        if changed { await send(.conditionChanged(.callAudioAccess, available: available)) }
        turn.give()
    }

    /// Keeps probe completion and the recording reservation in one delivery turn.
    func deliver(_ event: RecordingEvent, to recording: RecordingInputs) async {
        await turn.take()
        let state = await recording.state()
        let ended: Bool
        if case let .sessionReported(id, .ended) = event { ended = state.session?.id == id }
        else { ended = false }
        let mayStart = event == .userStart || event == .callStarted || (ended && state.pendingCall)
        if let access {
            await access.transition(ended: ended, mayStart: mayStart, refreshConditions: { available in
                await self.readConditions(available: available)
            }, unavailable: {
                lastSent.withLock { $0[.callAudioAccess] = false }
                await send(.conditionChanged(.callAudioAccess, available: false))
            }, deliver: {
                await recording.send(event)
                return await recording.state().phase != .idle
            })
        } else {
            if mayStart { await readConditions(available: nil) }
            await recording.send(event)
        }
        turn.give()
    }

    deinit { observation.withLock { $0 }?.cancel() }
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

public func composeRecordingConditions(recording: RecordingInputs, callsURL: URL, access: AccessPolicy) -> RecordingConditions {

    RecordingConditions(
        recording: recording,
        microphoneAccess: { AVCaptureDevice.authorizationStatus(for: .audio) == .authorized },
        callAudioAccess: { false },
        callsFolder: {
            isCallsDirectory(callsURL) && FileManager.default.isWritableFile(atPath: callsURL.path)
        },
        room: {
            callsFolderHasRoom(at: callsURL, availableCapacity: { url in
                try? url.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
                    .volumeAvailableCapacityForImportantUsage
            })
        }, access: access
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
