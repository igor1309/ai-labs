import AVFoundation
import Foundation
import Recording
import Synchronization

public final class RecordingConditions: Sendable {

    private let checks: [(RecordingCondition, @Sendable () -> Bool)]
    private let send: @Sendable (RecordingEvent) -> Void
    private let lastSent = Mutex<[RecordingCondition: Bool]>([:])

    public convenience init(
        recording: Recording,
        microphoneAccess: @escaping @Sendable () -> Bool,
        callAudioAccess: @escaping @Sendable () -> Bool,
        callsFolder: @escaping @Sendable () -> Bool,
        room: @escaping @Sendable () -> Bool
    ) {

        self.init(
            send: { [weak recording] in recording?.send($0) },
            microphoneAccess: microphoneAccess, callAudioAccess: callAudioAccess,
            callsFolder: callsFolder, room: room
        )
    }

    // The delivery seam exposes events that Recording may reduce without a state change.
    init(
        send: @escaping @Sendable (RecordingEvent) -> Void,
        microphoneAccess: @escaping @Sendable () -> Bool,
        callAudioAccess: @escaping @Sendable () -> Bool,
        callsFolder: @escaping @Sendable () -> Bool,
        room: @escaping @Sendable () -> Bool
    ) {

        self.send = send
        checks = [
            (.microphoneAccess, microphoneAccess), (.callAudioAccess, callAudioAccess),
            (.callsFolder, callsFolder), (.room, room),
        ]
    }

    public func refresh() {

        lastSent.withLock { previous in
            for (condition, read) in checks {
                let available = read()
                if previous[condition] != available {
                    send(.conditionChanged(condition, available: available))
                    previous[condition] = available
                }
            }
        }
    }
}

public func composeRecordingConditions(recording: Recording, callsURL: URL) -> RecordingConditions {

    RecordingConditions(
        recording: recording,
        microphoneAccess: { AVCaptureDevice.authorizationStatus(for: .audio) == .authorized },
        // Process taps have no access status; a denied capture reports through Session.
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
