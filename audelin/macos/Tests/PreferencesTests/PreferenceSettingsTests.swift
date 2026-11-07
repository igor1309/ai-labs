import Foundation
import Preferences
import Testing

@MainActor
struct PreferenceSettingsTests {

    @Test func successfulChangesCommitFreshValuesBeforeNotifying() async {

        for enabled in [false, true] {
            let initial = Preferences(automaticRecording: !enabled, liveText: !enabled,
                                      callsFolder: URL(fileURLWithPath: "/calls"))
            let storage = SettingsStorageSpy(initial)
            var notices: [Bool] = []
            weak var observedSettings: PreferenceSettings?
            let settings = PreferenceSettings(storage: storage, automaticChanged: { value in
                #expect(storage.stored.automaticRecording == value)
                #expect(observedSettings?.snapshot == storage.stored)
                notices.append(value)
            })
            observedSettings = settings
            #expect(settings.snapshot == initial)
            storage.reads = 0

            storage.stored.callsFolder = URL(fileURLWithPath: "/current-calls")
            storage.stored.liveText = enabled
            await settings.setAutomatic(enabled)
            #expect(storage.reads == 0)
            #expect(settings.snapshot == Preferences(automaticRecording: enabled, liveText: enabled,
                                                     callsFolder: storage.stored.callsFolder))
            #expect(notices == [enabled])

            storage.stored.automaticRecording = !enabled
            await settings.setLiveText(!enabled)
            #expect(settings.snapshot == Preferences(automaticRecording: !enabled, liveText: !enabled,
                                                     callsFolder: storage.stored.callsFolder))
            #expect(notices == [enabled])
            #expect(storage.writes == [
                Preferences(automaticRecording: enabled, liveText: enabled, callsFolder: storage.stored.callsFolder),
                Preferences(automaticRecording: !enabled, liveText: !enabled, callsFolder: storage.stored.callsFolder),
            ])
            storage.stored.callsFolder = URL(fileURLWithPath: "/new-calls")
            #expect(settings.callsFolder == storage.stored.callsFolder)
        }
    }

    @Test func failedWritesRetainCheckedSnapshotAndSendNoNotice() async {

        for enabled in [false, true] {
            let initial = Preferences(automaticRecording: enabled, liveText: enabled,
                                      callsFolder: URL(fileURLWithPath: "/calls"))
            let storage = SettingsStorageSpy(initial)
            storage.fails = true
            let settings = PreferenceSettings(storage: storage, automaticChanged: { _ in
                Issue.record("A failed write must not change automatic recording")
            })
            storage.stored.callsFolder = URL(fileURLWithPath: "/current-calls")
            await settings.setAutomatic(!enabled)
            #expect(settings.snapshot == initial)
            await settings.setLiveText(!enabled)
            #expect(settings.snapshot == initial)
            #expect(storage.writes == [
                Preferences(automaticRecording: !enabled, liveText: enabled, callsFolder: storage.stored.callsFolder),
                Preferences(automaticRecording: enabled, liveText: !enabled, callsFolder: storage.stored.callsFolder),
            ])
            #expect(storage.stored.automaticRecording == enabled)
            #expect(storage.stored.liveText == enabled)

            storage.fails = false
            await settings.setLiveText(!enabled)
            #expect(settings.snapshot == Preferences(automaticRecording: enabled, liveText: !enabled,
                                                     callsFolder: storage.stored.callsFolder))
        }
    }
}

private final class SettingsStorageSpy: PreferenceSettingsStorage {

    struct WriteFailure: Error {}

    var stored: Preferences
    var writes: [Preferences] = []
    var fails = false
    var reads = 0

    init(_ stored: Preferences) { self.stored = stored }

    func read() -> Preferences { reads += 1; return stored }

    func updateRecording(automatic: Bool?, liveText: Bool?) throws -> Preferences {
        var preferences = stored
        if let automatic { preferences.automaticRecording = automatic }
        if let liveText { preferences.liveText = liveText }
        writes.append(preferences)
        if fails { throw WriteFailure() }
        stored = preferences
        return preferences
    }
}
