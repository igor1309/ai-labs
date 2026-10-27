import Foundation
import Observation

public protocol PreferenceSettingsStorage {

    func read() -> Preferences
    func write(_ preferences: Preferences) throws
}

@MainActor @Observable
public final class PreferenceSettings {

    public private(set) var snapshot: Preferences
    private let storage: any PreferenceSettingsStorage
    private let automaticChanged: (Bool) -> Void

    public init(storage: any PreferenceSettingsStorage, automaticChanged: @escaping (Bool) -> Void) {

        self.storage = storage
        self.automaticChanged = automaticChanged
        snapshot = storage.read()
    }

    public var callsFolder: URL { storage.read().callsFolder }

    public func setAutomatic(_ enabled: Bool) {

        if update({ $0.automaticRecording = enabled }) {
            automaticChanged(enabled)
        }
    }

    public func setLiveText(_ enabled: Bool) {

        _ = update { $0.liveText = enabled }
    }

    private func update(_ change: (inout Preferences) -> Void) -> Bool {

        var updated = storage.read()
        change(&updated)
        do {
            try storage.write(updated)
            snapshot = updated
            return true
        } catch {
            return false
        }
    }
}
