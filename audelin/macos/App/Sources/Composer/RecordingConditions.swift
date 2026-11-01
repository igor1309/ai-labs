import Dispatch
import Foundation
import Recording
import Synchronization
import CallAudioAccess

final class RecordingConditions: Sendable {

    private let checks: [(RecordingCondition, @Sendable () -> Bool)]
    private let send: @Sendable (RecordingEvent) async -> Void
    private let lastSent = Mutex<[RecordingCondition: Bool]>([:])
    private let turn = Turn()
    private let access: AccessPolicy
    private let observation = Mutex<Task<Void, Never>?>(nil)
    // The checks read the disk and access status, which block, so they run here.
    private let checking = DispatchQueue(label: "audelin.RecordingConditions")

    convenience init(
        recording: RecordingInputs,
        microphoneAccess: @escaping @Sendable () -> Bool,
        callsFolder: @escaping @Sendable () -> Bool,
        room: @escaping @Sendable () -> Bool,
        access: AccessPolicy,
        sink: any LogSink
    ) {

        self.init(
            send: recording.send,
            microphoneAccess: microphoneAccess,
            callsFolder: callsFolder, room: room, sink: sink, access: access
        )
    }

    // The delivery seam exposes events that Recording may reduce without a state change.
    init(
        send: @escaping @Sendable (RecordingEvent) async -> Void,
        microphoneAccess: @escaping @Sendable () -> Bool,
        callsFolder: @escaping @Sendable () -> Bool,
        room: @escaping @Sendable () -> Bool,
        sink: any LogSink,
        access: AccessPolicy
    ) {

        self.access = access
        self.send = { event in
            logCondition(event, sink: sink)
            await send(event)
        }
        checks = [
            (.microphoneAccess, microphoneAccess),
            (.callsFolder, callsFolder), (.room, room),
        ]
        observation.withLock { $0 = Task { [weak self] in
            for await _ in await access.states() {
                await self?.publishAccess()
            }
        } }
    }

    func refresh() async {
        _ = await access.refresh()
        await turn.take()
        let checks = checks
        var readings = await withCheckedContinuation { (done: CheckedContinuation<[(RecordingCondition, Bool)], Never>) in
            checking.async { done.resume(returning: checks.map { ($0.0, $0.1()) }) }
        }
        for await state in await access.states() {
            readings.insert((.callAudioAccess, state.published), at: 1)
            break
        }
        for (condition, available) in readings { await publish(condition, available: available) }
        turn.give()
    }

    func publishAccess() async {
        await turn.take()
        // A queued publication must not overwrite a newer condition snapshot.
        for await state in await access.states() {
            await publish(.callAudioAccess, available: state.published)
            break
        }
        turn.give()
    }

    private func publish(_ condition: RecordingCondition, available: Bool) async {
        let changed = lastSent.withLock { values in
            let changed = values[condition] != available
            values[condition] = available
            return changed
        }
        if changed { await send(.conditionChanged(condition, available: available)) }
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

func composeRecordingConditions(recording: RecordingInputs, callsURL: URL, boundary: ComposerBoundary) -> RecordingConditions {

    RecordingConditions(
        recording: recording,
        microphoneAccess: { boundary.microphonePermission.authorized() },
        callsFolder: {
            isCallsDirectory(callsURL) && FileManager.default.isWritableFile(atPath: callsURL.path)
        },
        room: {
            callsFolderHasRoom(at: callsURL, availableCapacity: { boundary.capacity.available(at: $0) })
        }, access: accessPolicy(boundary.access), sink: boundary.log
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
