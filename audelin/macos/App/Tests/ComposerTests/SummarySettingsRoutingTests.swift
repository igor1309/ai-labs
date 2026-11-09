import AppKit
import BlockingTestWork
import Foundation
import Observation
import Preferences
import SettingsUI
import SummaryRuntime
import SwiftUI
import Testing
@testable import Composer

@MainActor @Suite(.timeLimit(.minutes(1)))
struct SummarySettingsRoutingTests {
    @Test func menuEditsAndSavesBothSlotsWithoutSeparateValidationOrChangingRecordingPreferences() async throws {
        try await withComposeFolder { root in
            let transport = SettingsNoHTTP()
            let rig = try await settingsFixture(root, transport)
            do {
                _ = try await loaded(rig.menu)
                await rig.menu.sendSettings(.selectTab(.callNotes))
                await rig.menu.sendSettings(.setAutomaticNotes(true))
                await rig.menu.sendSettings(.setIdentifySpeakers(true))
                try await editSlots(rig.menu)
                let edited = try await loaded(rig.menu) { $0.automatic && $0.identifySpeakers
                    && $0.runtimes.last?.fields.first?.value == "fallback-distinct"
                    && $0.runtimes.last?.fields.last?.value == ""
                    && $0.runtimes.last?.fields.first { $0.id == .endpoint }?.value == "http://localhost:9191/fallback" }
                #expect(rig.menu.settingsState.selectedTab == .callNotes)
                #expect(edited.save.isEnabled)
                assertRenderedChoices(rig.menu.settingsState, canSave: true)
                await rig.menu.sendSettings(.notesAction(.save))
                _ = try await loaded(rig.menu) { $0.status == "Настройки сохранены" }
                assertRenderedChoices(rig.menu.settingsState, canSave: false)
                let preferences = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json")).read()
                #expect(preferences.notes == expectedNotes())
                #expect(!preferences.automaticRecording && !preferences.liveText && preferences.callsFolder == root)
                #expect(await transport.requests == 0)
                await rig.finish()
                // ComposeFixture writes its supplied preferences; pass the actual disk read-back.
                let restored = try await ComposeFixture.make(root: root, preferences: preferences, summaryRuntime: settingsRuntime(transport))
                do {
                    _ = try await loaded(restored.menu)
                    await restored.menu.sendSettings(.selectTab(.callNotes))
                    let draft = try await loaded(restored.menu)
                    #expect(draft.automatic && draft.identifySpeakers)
                    assertRenderedChoices(restored.menu.settingsState, canSave: false)
                    #expect(!restored.menu.settingsState.recordsCalls && !restored.menu.settingsState.liveText)
                    #expect(restored.menu.settingsState.folder.path == root.path)
                    await restored.finish()
                } catch { await restored.finish(); throw error }
            } catch { await rig.finish(); throw error }
        }
    }

    @Test func menuClearsFallbackAndSavesWithoutCredentials() async throws {
        try await withComposeFolder { root in
            let transport = SettingsNoHTTP(), rig = try await settingsFixture(root, transport)
            do {
                let initial = try await loaded(rig.menu)
                #expect(initial.runtimes[1].kind == .unconfigured)
                await rig.menu.sendSettings(.setAutomaticNotes(true))
                try await editSlots(rig.menu)
                await rig.menu.sendSettings(.selectNotesRuntime(.fallback, .unconfigured))
                let cleared = try await loaded(rig.menu) { $0.automatic && $0.runtimes[1].kind == .unconfigured }
                #expect(cleared.runtimes[1].fields.isEmpty && cleared.save.isEnabled)
                await rig.menu.sendSettings(.notesAction(.save))
                _ = try await loaded(rig.menu) { $0.status == "Настройки сохранены" }
                let notes = PreferencesStore(fileURL: root.appendingPathComponent("preferences.json")).read().notes
                #expect(notes.enabled && notes.fallback == nil)
                #expect(notes.primary.model == "primary-distinct")
                #expect(await transport.requests == 0)
                await rig.finish()
            } catch { await rig.finish(); throw error }
        }
    }

    @Test func invalidFallbackModelDisablesSaveAndIdentifiesOnlyThatField() async throws {
        try await withComposeFolder { root in
            let transport = SettingsNoHTTP(), rig = try await settingsFixture(root, transport)
            do {
                _ = try await loaded(rig.menu)
                await rig.menu.sendSettings(.selectTab(.callNotes))
                await rig.menu.sendSettings(.setAutomaticNotes(true))
                try await editSlots(rig.menu)
                await rig.menu.sendSettings(.editNotesField(.fallback, .model, "  "))
                _ = try await loaded(rig.menu) { $0.runtimes.last?.fields.first?.value == "  " }
                await rig.menu.sendSettings(.notesAction(.validate))
                let invalid = try await loaded(rig.menu) { $0.status.contains("Резервный сервис") }
                #expect(!invalid.save.isEnabled)
                let host = settingsHost(rig.menu.settingsState)
                defer { host.window?.close() }
                let save = try #require(descendants(host).compactMap { $0 as? NSButton }.first { $0.accessibilityIdentifier() == "notes-save" })
                #expect(!save.isEnabled)
                let marked = invalid.runtimes.flatMap { runtime in runtime.fields.filter(\.isInvalid).map { runtime.id.rawValue + "." + $0.id.rawValue } }
                #expect(marked == ["fallback.model"])
                #expect(PreferencesStore(fileURL: root.appendingPathComponent("preferences.json")).read().notes == NotesPreferences())
                #expect(await transport.requests == 0)
                await rig.finish()
            } catch { await rig.finish(); throw error }
        }
    }
}
@MainActor private func settingsFixture(_ root: URL, _ http: SettingsNoHTTP) async throws -> ComposeFixture {
    try await ComposeFixture.make(root: root, preferences: Preferences(automaticRecording: false, liveText: false, callsFolder: root), summaryRuntime: settingsRuntime(http))
}
private func settingsRuntime(_ http: SettingsNoHTTP) -> Runtime {
    Runtime(process: SettingsNoProcess(), http: http, credential: { _ in nil }, resolveProgram: { $0 }, deadline: { Issue.record("validation must not start generation"); throw Failure.timeout })
}
@MainActor private func editSlots(_ menu: AudelinMenu) async throws {
    for (slot, model, endpoint) in [(SettingsState.NotesRuntime.Slot.primary, "primary-distinct", "http://127.0.0.1:8181/primary"), (.fallback, "fallback-distinct", "http://localhost:9191/fallback")] {
        await menu.sendSettings(.selectNotesRuntime(slot, .compatibleAPI))
        await menu.sendSettings(.editNotesField(slot, .model, model))
        await menu.sendSettings(.editNotesField(slot, .endpoint, endpoint))
        await menu.sendSettings(.editNotesField(slot, .credentialVariable, ""))
    }
}
private func expectedNotes() -> NotesPreferences {
    .init(enabled: true, speakers: true,
          primary: .init(kind: "compatibleAPI", model: "primary-distinct", executable: "", endpoint: "http://127.0.0.1:8181/primary", credentialVariable: ""),
          fallback: .init(kind: "compatibleAPI", model: "fallback-distinct", executable: "", endpoint: "http://localhost:9191/fallback", credentialVariable: ""))
}
@MainActor private func loaded(_ menu: AudelinMenu, where matches: (SettingsState.NotesDraft) -> Bool = { _ in true }) async throws -> SettingsState.NotesDraft {
    for await state in Observations({ menu.settingsState }) {
        if case let .loaded(draft) = state.callNotes, matches(draft) { return draft }
    }
    throw ScriptFailure.failed
}
@MainActor private func settingsHost(_ state: SettingsState) -> NSHostingView<SettingsView> {
    let host = NSHostingView(rootView: SettingsView(state: state, event: { _ in }))
    let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 620, height: 1200), styleMask: .borderless, backing: .buffered, defer: false)
    window.isReleasedWhenClosed = false
    window.contentView = host
    host.layoutSubtreeIfNeeded()
    return host
}
@MainActor private func descendants(_ view: NSView) -> [NSView] { [view] + view.subviews.flatMap(descendants) }
@MainActor private func assertRenderedChoices(_ state: SettingsState, canSave: Bool) {
    let host = settingsHost(state)
    defer { host.window?.close() }
    let views = descendants(host)
    let inputs = Dictionary(uniqueKeysWithValues: views.compactMap { view -> (String, String)? in
        guard let input = view as? NSTextField else { return nil }
        let id = input.accessibilityIdentifier()
        guard id.hasPrefix("notes-") else { return nil }
        return (id, input.stringValue)
    })
    #expect(inputs == ["notes-primary-model": "primary-distinct", "notes-primary-endpoint": "http://127.0.0.1:8181/primary", "notes-primary-credentialVariable": "", "notes-fallback-model": "fallback-distinct", "notes-fallback-endpoint": "http://localhost:9191/fallback", "notes-fallback-credentialVariable": ""])
    let buttons = views.compactMap { $0 as? NSButton }
    for id in ["notes-automatic", "notes-speakers"] {
        #expect(buttons.first { $0.accessibilityIdentifier() == id }?.state == .on)
    }
    #expect(buttons.first { $0.accessibilityIdentifier() == "notes-save" }?.isEnabled == canSave)
    let menus = views.compactMap { $0 as? NSPopUpButton }
    #expect(menus.count == 2)
    #expect(menus.allSatisfy { $0.selectedItem?.representedObject as? String == "compatibleAPI" })
}
private actor SettingsNoHTTP: HTTPRequesting {
    var requests = 0
    func request(url: URL, headers: [String: String], body: Data, loopback: Bool) throws -> HTTPResponse {
        requests += 1; Issue.record("validation must not send a request"); throw Failure.transport
    }
}
private struct SettingsNoProcess: ProcessRunning {
    func run(program: String, arguments: [String], input: Data) throws -> ProcessOutput { Issue.record("local API validation must not run a process"); throw Failure.unavailable }
}
