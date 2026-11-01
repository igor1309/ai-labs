import BlockingTestWork
import Composer
import Foundation
import MenuBar
import Observation
import PanelUI
import Preferences
import Testing
@testable import Audelin

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct MenuBarActionTests {
    @Test func actionsReachRecordingPreferencesFoldersAndTermination() async throws {
        try await withComposeFolder { root in
            let opened = Values<URL>(), urls = Values<URL>(), terminated = Values<Bool>()
            let rig = try await ComposeFixture.make(root: root, openFolder: { opened.append($0); return true },
                openURL: urls.append, terminate: { terminated.append(true) })
            do {
                await rig.menu.perform(.openCallsFolder)
                await rig.menu.sendPanel(.openSettings(.microphone))
                await rig.menu.sendPanel(.openSettings(.systemAudioRecording))
                #expect(opened.all == [root])
                #expect(urls.all.map(\.absoluteString) == [
                    "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
                    "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
                ])
                await rig.menu.perform(.setAutomatic(true))
                await rig.menu.perform(.setLiveText(false))
                #expect(rig.menu.preferences.automaticRecording && !rig.menu.preferences.liveText)
                let snapshot = await offPool { PreferencesStore(fileURL: root.appendingPathComponent("preferences.json")).read() }
                #expect(snapshot == rig.menu.preferences)
                await rig.menu.sendPanel(.start)
                _ = try await rig.state { $0.phase == .recording }
                await rig.menu.sendPanel(.stop)
                _ = try await rig.state { $0.phase == .idle }
                await rig.finish()
                #expect(terminated.all == [true])
                await rig.menu.perform(.start)
                await rig.menu.perform(.quit)
                #expect(rig.microphone.starts.all == [true])
                #expect(terminated.all == [true])
            } catch { await rig.finish(); throw error }
        }
    }

    @Test func startupAndRuntimeDetectionFailuresReachTheMenu() async throws {
        for startup in [false, true] {
            let binding = CallBinding(fails: startup, input: false)
            try await withComposition(configure: { $0.processes = FixtureProcesses(binding: binding) }) { rig in
                if !startup { binding.fail() }
                let prefix = startup ? "Не удалось начать наблюдение за звонками" : "Наблюдение за звонками остановлено"
                for await menu in Observations({ rig.menu.menu }) {
                    if menu.entries.contains(.stateLine("\(prefix): failed")) { break }
                }
                #expect(rig.menu.menu.entries.contains(.stateLine("\(prefix): failed")))
                #expect(rig.log.entries.all.contains { $0.category == .menu && $0.error == "failed" })
                #expect(rig.microphone.starts.all.isEmpty && rig.call.starts.all.isEmpty)
            }
        }
    }

    @Test func recordingMenuAndPanelPortsCarryStateActionsDelayAndLogs() async throws {
        try await withComposeFolder { root in
            let visibility = Values<Bool>(), calls = Values<Bool>()
            let rig = try await ComposeFixture.make(root: root, presentCalls: { calls.append(true) }, presentPanel: visibility.append)
            do {
                rig.menu.appReopened()
                #expect(calls.all == [true])
                try await rig.start()
                for await state in Observations({ rig.menu.state }) where state.phase == .recording { break }
                #expect(visibility.all == [true])
                rig.menu.appReopened()
                rig.menu.panelClosed()
                rig.menu.appReopened()
                #expect(visibility.all == [true, true, false, true])
                let first = panelContentBinding(rig.menu)
                #expect(first.state == rig.menu.panelState)
                rig.clock.advance(65)
                _ = try await rig.panel { $0.recording == .on(elapsed: "00:01:05") }
                for await state in Observations({ rig.menu.panelState }) where state.recording == .on(elapsed: "00:01:05") { break }
                let updated = panelContentBinding(rig.menu)
                #expect(updated.state.recording == .on(elapsed: "00:01:05"))
                #expect(first.state.recording != updated.state.recording)
                await updated.event(.stop).value
                _ = try await rig.state { $0.phase == .idle }
                await rig.clock.waitForSleep(.seconds(3))
                rig.clock.wake(.seconds(3))
                await rig.log.wait { $0.category == .panel && $0.message == "hidden reason=recordingEnded" }
                #expect(visibility.all == [true, true, false, true, false])
                let messages = rig.log.entries.all.filter { $0.category == .panel }.map(\.message)
                #expect(messages == ["shown reason=recordingBegan", "shown reason=appReopen", "hidden reason=userClosed", "shown reason=appReopen", "hidden reason=recordingEnded"])
                await rig.finish()
            } catch { await rig.finish(); throw error }
        }
    }
}
