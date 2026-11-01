@testable import Compose
import Foundation
import MenuBar
import PanelUI
import Preferences
import Recording
import Testing

@MainActor
struct MenuBarActionTests {

    @Test func panelBannerButtonsOpenTheirPrivacyPanesOrTheCurrentCallsFolder() async {

        var stored = Preferences(callsFolder: URL(fileURLWithPath: "/calls"))
        var urls: [URL] = []
        var folders: [URL] = []
        let menu = await AudelinMenu(
            storage: MenuPreferenceStorage(readValue: { stored }, writeValue: { stored = $0 }),
            makeApplication: {
                MenuApplication(states: { AsyncStream { $0.finish() } }, failures: AsyncStream { $0.finish() },
                    send: { _ in Issue.record("Unexpected recording action") }, quit: {},
                    panelStates: { AsyncStream { $0.finish() } },
                    sendPanel: { _ in Issue.record("Banner action was not handled") })
            },
            openFolder: { folders.append($0) }, openURL: { urls.append($0) },
            terminate: {}, didDeliver: {}, sink: SystemLogSink(),
            presentPanel: { _ in }, sleep: { _ in throw CancellationError() }
        )
        for (banner, pane): (PanelState.Banner, String) in [
            (.callAudio, "Privacy_ScreenCapture"), (.microphone, "Privacy_Microphone"),
            (.callSilent, "Privacy_ScreenCapture"),
        ] {
            await menu.sendPanel(banner.action)
            #expect(urls.last?.absoluteString == "x-apple.systempreferences:com.apple.preference.security?\(pane)")
        }
        #expect(urls.count == 3)
        stored.callsFolder = URL(fileURLWithPath: "/current-calls")
        await menu.sendPanel(PanelState.Banner.diskFull(savedUntil: "01:05").action)
        #expect(folders == [stored.callsFolder])
        await menu.waitForObservers()
    }

    @Test func presentationMapsEveryRecordingFault() {

        for (faults, expected): (Set<RecordingFault>, Set<MenuBarFault>) in [
            ([.microphone], [.microphone]), ([.callAudio], [.callAudio]), ([.diskFull], [.diskFull]),
            (Set(RecordingFault.allCases), [.microphone, .callAudio, .diskFull]),
        ] {
            for phase: RecordingState.Phase in [.beginning, .recording, .ending, .idle] {
                for origin: RecordingState.Origin in [.hand, .call] {
                    var state = RecordingState(automatic: true, missing: [])
                    state.phase = phase
                    state.session = .init(id: 1, origin: origin)
                    state.faults = faults
                    let input: MenuBarRecording = switch phase {
                    case .idle: .idle(automatic: true, unavailable: [], failure: nil)
                    case .beginning, .recording: .recording(call: origin == .call, faults: expected)
                    case .ending: .ending(faults: expected)
                    }
                    #expect(menuBarRecording(state) == input)
                }
            }
        }
    }


    @Test func presentationMapsTheCurrentCallSilenceWarning() {

        for phase: RecordingState.Phase in [.beginning, .recording, .ending, .idle] {
            for callSilent in [false, true] {
                var state = RecordingState(missing: [])
                state.phase = phase
                state.callSilent = callSilent
                state.faults = [.microphone]
                let faults: Set<MenuBarFault> = callSilent ? [.microphone, .callSilent] : [.microphone]
                let expected: MenuBarRecording = switch phase {
                case .idle: .idle(automatic: false, unavailable: [], failure: nil)
                case .beginning, .recording: .recording(call: false, faults: faults)
                case .ending: .ending(faults: faults)
                }
                #expect(menuBarRecording(state) == expected)
            }
        }
    }

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
        let menu = await AudelinMenu(
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
                    quit: { quits += 1 },
                    panelStates: { AsyncStream { $0.finish() } }, sendPanel: { _ in }
                )
            },
            openFolder: { folders.append($0) }, openURL: { _ in Issue.record("Unexpected URL open") }, terminate: { terminations += 1 },
            didDeliver: { Issue.record("No updates were sent") }, sink: SystemLogSink(),
            presentPanel: { _ in }, sleep: { _ in throw CancellationError() }
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

        let unavailable = await AudelinMenu(
            storage: MenuPreferenceStorage(readValue: { stored }, writeValue: { stored = $0 }),
            makeApplication: { factoryCalls += 1; throw ScriptFailure.failed },
            openFolder: { folders.append($0) }, openURL: { _ in Issue.record("Unexpected URL open") }, terminate: { terminations += 1 },
            didDeliver: { Issue.record("A failed application has no streams") }, sink: SystemLogSink(),
            presentPanel: { _ in }, sleep: { _ in throw CancellationError() }
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
                    variants.append((state, phase == .ending ? .ending(faults: []) : .recording(call: origin == .call, faults: [])))
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
                let menu = await AudelinMenu(
                    storage: MenuPreferenceStorage(readValue: { stored },
                        writeValue: { _ in Issue.record("Presentation does not write preferences") }),
                    makeApplication: {
                        MenuApplication(states: { states.stream }, failures: failures.stream,
                            send: { _ in Issue.record("Presentation does not send events") },
                            quit: { Issue.record("Presentation does not quit") },
                            panelStates: { AsyncStream { $0.finish() } }, sendPanel: { _ in })
                    },
                    openFolder: { _ in Issue.record("Presentation does not open folders") }, openURL: { _ in Issue.record("Unexpected URL open") },
                    terminate: { Issue.record("Presentation does not terminate") }, didDeliver: { delivered.send() }, sink: SystemLogSink(),
                    presentPanel: { _ in }, sleep: { _ in throw CancellationError() }
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
