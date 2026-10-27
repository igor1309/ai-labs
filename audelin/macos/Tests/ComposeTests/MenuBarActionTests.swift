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
            storage: MenuPreferenceStorage(readValue: { stored },
                writeValue: { stored = $0; writes.append($0) }),
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

    @Test func presentationInputsTranslateRecordingAndPreferences() {

        for automatic in [false, true] {
            for liveText in [false, true] {
                let stored = Preferences(automaticRecording: automatic, liveText: liveText,
                                         callsFolder: URL(fileURLWithPath: "/calls"))
                #expect(menuBarPreferences(stored) == MenuBarPreferences(automatic: automatic, liveText: liveText))
            }
            for (missing, blockers): (Set<RecordingCondition>, Set<MenuBarBlocker>) in [
                ([], []), ([.microphoneAccess], [.microphone]), ([.callAudioAccess], [.callAudio]),
                ([.callsFolder], [.folder]), ([.room], [.space]),
                (Set(RecordingCondition.allCases), Set(MenuBarBlocker.allCases)),
            ] {
                for failure: String? in [nil, "Ошибка записи"] {
                    var state = RecordingState(automatic: automatic, missing: missing)
                    state.cannotRecord = failure
                    #expect(menuBarRecording(state) == .idle(automatic: automatic, unavailable: blockers, failure: failure))
                }
            }
        }
        for origin: RecordingState.Origin? in [nil, .call, .hand] {
            for phase: RecordingState.Phase in [.beginning, .recording, .ending] {
                var state = RecordingState()
                state.phase = phase
                state.session = origin.map { .init(id: 42, origin: $0) }
                state.callOn = origin != .call
                let input = menuBarRecording(state)
                #expect(input == (phase == .ending ? .ending : .recording(call: origin == .call)))
                let item = MenuBarItem.from(input, liveText: true)
                #expect(item.isRed == (phase != .ending))
            }
        }
    }
}

private struct MenuPreferenceStorage: PreferenceSettingsStorage {

    let readValue: () -> Preferences
    let writeValue: (Preferences) throws -> Void

    func read() -> Preferences { readValue() }
    func write(_ preferences: Preferences) throws { try writeValue(preferences) }
}
