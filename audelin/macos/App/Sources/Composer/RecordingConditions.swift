import Foundation
import Recording
import Synchronization
import CallAudioAccess

final class RecordingConditions: Sendable {

    private let checks: [(RecordingCondition, @Sendable () -> Bool)]
    private let send: @Sendable (RecordingEvent) async -> Void
    private let lastSent = Mutex<[RecordingCondition: Bool]>([:])
    private let turn = Turn()
    private let storageMoving = Mutex(false)
    private let access: AccessPolicy
    private let observation = Mutex<Task<Void, Never>?>(nil)

    init(recording: RecordingInputs, callsURL: URL, boundary: ComposerBoundary, currentFolder: (@Sendable () -> URL)? = nil) {
        let folder: @Sendable () -> URL = currentFolder ?? { callsURL }
        let access = accessPolicy(boundary.access)
        let send = recording.send
        let sink = boundary.log
        self.access = access
        self.send = { event in
            logCondition(event, sink: sink)
            await send(event)
        }
        checks = [
            (.microphoneAccess, { boundary.microphonePermission.authorized() }),
            (.callsFolder, { isCallsDirectory(folder()) && FileManager.default.isWritableFile(atPath: folder().path) }),
            (.room, { callsFolderHasRoom(at: folder(), availableCapacity: { boundary.capacity.available(at: $0) }) }),
        ]
        observation.withLock { $0 = Task { [weak self] in
            for await _ in await access.states() {
                await self?.publishAccess()
            }
        } }
    }

    func setStorageMoving(_ moving: Bool) async {
        await turn.take()
        storageMoving.withLock { $0 = moving }
        if moving { await publish(.callsFolder, available: false) }
        turn.give()
    }

    func refresh() async {
        _ = await access.refresh()
        await turn.take()
        // The checks read the disk and access status where they are called; the turn orders them.
        var readings = checks.map { ($0.0, $0.1()) }
        for await state in await access.states() {
            readings.insert((.callAudioAccess, state.published), at: 1)
            break
        }
        for (condition, available) in readings { await publish(condition, available: available && (condition != .callsFolder || !storageMoving.withLock { $0 })) }
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

func composeRecordingConditions(recording: RecordingInputs, callsURL: URL, boundary: ComposerBoundary, currentFolder: (@Sendable () -> URL)? = nil) -> RecordingConditions {

    RecordingConditions(recording: recording, callsURL: callsURL, boundary: boundary, currentFolder: currentFolder)
}

private func callsFolderHasRoom(at url: URL, availableCapacity: @Sendable (URL) -> Int64?) -> Bool {

    guard isCallsDirectory(url), let bytes = availableCapacity(url) else { return false }
    return bytes >= 30 * 1_000_000_000
}

private func isCallsDirectory(_ url: URL) -> Bool {

    var directory: ObjCBool = false
    return FileManager.default.fileExists(atPath: url.path, isDirectory: &directory) && directory.boolValue
}

private func logCondition(_ event: RecordingEvent, sink: any LogSink) {

    if case let .conditionChanged(condition, available) = event {
        sink.write(.init(category: .conditions, message: "condition=\(condition) available=\(available)"))
    }
}
