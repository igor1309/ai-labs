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
        var terminations = 0
        var factoryCalls = 0
        let states = AsyncStream<RecordingState>.makeStream()
        let failures = AsyncStream<any Error>.makeStream()
        defer { states.continuation.finish(); failures.continuation.finish() }
        let menu = AudelinMenu(
            storage: MenuPreferenceStorage(readValue: { stored },
                writeValue: { stored = $0; writes.append($0) }),
            makeApplication: {
                factoryCalls += 1
                return MenuApplication(
                    states: { states.stream }, failures: failures.stream,
                    send: { event in
                        if case let .automaticChanged(enabled) = event {
                            #expect(stored.automaticRecording == enabled)
                        }
                        events.append(event)
                    },
                    quit: { quits += 1 }
                )
            },
            openFolder: { folders.append($0) }, terminate: { terminations += 1 },
            didDeliver: { Issue.record("No updates were sent") }
        )
        #expect(factoryCalls == 1)
        #expect(menu.menu.entries.first == .stateLine(menu.menu.item.stateLine))
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
        #expect(terminations == 0)
        #expect(menu.quitting)
        states.continuation.finish()
        failures.continuation.finish()
        await menu.waitForObservers()

        let unavailable = AudelinMenu(
            storage: MenuPreferenceStorage(readValue: { stored }, writeValue: { stored = $0 }),
            makeApplication: { factoryCalls += 1; throw ScriptFailure.failed },
            openFolder: { folders.append($0) }, terminate: { terminations += 1 },
            didDeliver: { Issue.record("A failed application has no streams") }
        )
        #expect(factoryCalls == 2)
        #expect(unavailable.menu.entries.first == .stateLine("Не удалось начать наблюдение за звонками: failed"))
        stored.callsFolder = URL(fileURLWithPath: "/after-startup-failure")
        await unavailable.perform(.openCallsFolder)
        #expect(folders == [URL(fileURLWithPath: "/current-calls"), stored.callsFolder])
        await unavailable.perform(.quit)
        await unavailable.perform(.quit)
        #expect(terminations == 1)
        #expect(quits == 1)
        #expect(unavailable.quitting)
        await unavailable.waitForObservers()
    }

    @Test func presentationInputsTranslateRecordingAndPreferences() async {

        for automatic in [false, true] {
            var variants: [(RecordingState, MenuBarRecording)] = []
            for (missing, blockers): (Set<RecordingCondition>, Set<MenuBarBlocker>) in [
                ([], []), ([.microphoneAccess], [.microphone]), ([.callAudioAccess], [.callAudio]),
                ([.callsFolder], [.folder]), ([.room], [.space]),
                (Set(RecordingCondition.allCases), Set(MenuBarBlocker.allCases)),
            ] {
                for failure: String? in [nil, "Ошибка записи"] {
                    var state = RecordingState(automatic: automatic, missing: missing)
                    state.cannotRecord = failure
                    variants.append((state, .idle(automatic: automatic, unavailable: blockers, failure: failure)))
                }
            }
            for origin: RecordingState.Origin? in [nil, .call, .hand] {
                for phase: RecordingState.Phase in [.beginning, .recording, .ending] {
                    var state = RecordingState()
                    state.phase = phase
                    state.session = origin.map { .init(id: 42, origin: $0) }
                    state.callOn = origin != .call
                    variants.append((state, phase == .ending ? .ending : .recording(call: origin == .call)))
                }
            }
            for liveText in [false, true] {
                let stored = Preferences(automaticRecording: automatic, liveText: liveText,
                                         callsFolder: URL(fileURLWithPath: "/calls"))
                #expect(menuBarPreferences(stored) == MenuBarPreferences(automatic: automatic, liveText: liveText))
                let states = AsyncStream<RecordingState>.makeStream()
                let failures = AsyncStream<any Error>.makeStream()
                let delivered = Signal()
                defer {
                    states.continuation.finish()
                    failures.continuation.finish()
                    delivered.end()
                }
                let menu = AudelinMenu(
                    storage: MenuPreferenceStorage(readValue: { stored },
                        writeValue: { _ in Issue.record("Presentation does not write preferences") }),
                    makeApplication: {
                        MenuApplication(states: { states.stream }, failures: failures.stream,
                            send: { _ in Issue.record("Presentation does not send events") },
                            quit: { Issue.record("Presentation does not quit") })
                    },
                    openFolder: { _ in Issue.record("Presentation does not open folders") },
                    terminate: { Issue.record("Presentation does not terminate") }, didDeliver: { delivered.send() }
                )
                for statusLine: String? in [nil, "Наблюдение за звонками остановлено: failed"] {
                    if let statusLine {
                        failures.continuation.yield(ScriptFailure.failed)
                        await delivered.next()
                        #expect(menu.menu.entries.first == .stateLine(statusLine))
                    }
                    for (state, input) in variants {
                        #expect(menuBarRecording(state) == input)
                        states.continuation.yield(state)
                        await delivered.next()
                        #expect(menu.state == state)
                        #expect(menu.menu == MenuBarModel(recording: input,
                            preferences: MenuBarPreferences(automatic: automatic, liveText: liveText),
                            statusLine: statusLine))
                        #expect(menu.menu.item.isRed == (state.phase == .beginning || state.phase == .recording))
                    }
                }
                states.continuation.finish()
                failures.continuation.finish()
                await menu.waitForObservers()
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
