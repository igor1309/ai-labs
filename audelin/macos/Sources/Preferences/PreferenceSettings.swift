import Foundation
import Observation

public protocol PreferenceSettingsStorage {

    func read() -> Preferences
    @MainActor func updateRecording(automatic: Bool?, liveText: Bool?) async throws -> Preferences
}

@MainActor @Observable
public final class PreferenceSettings {

    public private(set) var snapshot: Preferences
    private let storage: any PreferenceSettingsStorage
    private let automaticChanged: (Bool) async -> Void

    public init(storage: any PreferenceSettingsStorage, automaticChanged: @escaping (Bool) async -> Void) {

        self.storage = storage
        self.automaticChanged = automaticChanged
        snapshot = storage.read()
    }

    public var callsFolder: URL { storage.read().callsFolder }

    public func setAutomatic(_ enabled: Bool) async {

        if await update(automatic: enabled) {
            await automaticChanged(enabled)
        }
    }

    public func setLiveText(_ enabled: Bool) async {

        _ = await update(liveText: enabled)
    }

    private func update(automatic: Bool? = nil, liveText: Bool? = nil) async -> Bool {
        do {
            snapshot = try await storage.updateRecording(automatic: automatic, liveText: liveText)
            return true
        } catch {
            return false
        }
    }
}
