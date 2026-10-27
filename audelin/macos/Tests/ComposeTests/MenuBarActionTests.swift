@testable import Compose
import Foundation
import MenuBar
import Preferences
import Recording
import Testing

@MainActor
struct MenuBarActionTests {

    @Test func actionsReachRecordingPreferencesFolderAndQuit() async {

        var stored = Preferences(automaticRecording: false, liveText: false,
                                 callsFolder: URL(fileURLWithPath: "/calls"))
        var writes: [Preferences] = []
        var events: [RecordingEvent] = []
        var folders: [URL] = []
        var quits = 0
        let menu = AudelinMenu(
            readPreferences: { stored },
            writePreferences: { stored = $0; writes.append($0) },
            send: { event in
                if case let .automaticChanged(enabled) = event {
                    #expect(stored.automaticRecording == enabled)
                }
                events.append(event)
            },
            openFolder: { folders.append($0) }, quit: { quits += 1 }
        )
        await menu.perform(.start)
        await menu.perform(.stop)
        for enabled in [true, false] {
            await menu.perform(.setAutomatic(enabled))
            #expect(menu.preferences.automaticRecording == enabled)
            #expect(menu.menu.entries.contains(.toggle("Записывать звонки автоматически",
                checked: enabled, .setAutomatic(!enabled))))
            await menu.perform(.setLiveText(enabled))
            #expect(menu.preferences.liveText == enabled)
            #expect(menu.menu.entries.contains(.toggle("Живой текст", checked: enabled, .setLiveText(!enabled))))
        }
        #expect(events == [.userStart, .userStop, .automaticChanged(true), .automaticChanged(false)])
        #expect(writes.map(\.automaticRecording) == [true, true, false, false])
        #expect(writes.map(\.liveText) == [false, true, true, false])
        #expect(writes.allSatisfy { $0.callsFolder == URL(fileURLWithPath: "/calls") })
        stored.callsFolder = URL(fileURLWithPath: "/current-calls")
        await menu.perform(.openCallsFolder)
        #expect(folders == [stored.callsFolder])
        await menu.perform(.quit)
        await menu.perform(.quit)
        #expect(quits == 1)
        #expect(menu.quitting)
    }

    @Test func failedPreferenceWritesKeepChecksAndDoNotChangeRecording() async {

        struct WriteFailure: Error {}
        for enabled in [false, true] {
            let stored = Preferences(automaticRecording: enabled, liveText: enabled,
                                     callsFolder: URL(fileURLWithPath: "/calls"))
            var writes: [Preferences] = []
            var events: [RecordingEvent] = []
            let menu = AudelinMenu(
                readPreferences: { stored },
                writePreferences: { writes.append($0); throw WriteFailure() },
                send: { events.append($0) }, openFolder: { _ in Issue.record("Unexpected folder action") },
                quit: { Issue.record("Unexpected quit") }
            )
            let before = menu.menu
            await menu.perform(.setAutomatic(!enabled))
            #expect(menu.menu == before)
            await menu.perform(.setLiveText(!enabled))
            #expect(menu.menu == before)
            #expect(menu.preferences == stored)
            #expect(events.isEmpty)
            #expect(writes == [
                Preferences(automaticRecording: !enabled, liveText: enabled, callsFolder: stored.callsFolder),
                Preferences(automaticRecording: enabled, liveText: !enabled, callsFolder: stored.callsFolder),
            ])
        }
    }
}
