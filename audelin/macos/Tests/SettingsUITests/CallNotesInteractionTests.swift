import AppKit
import RenderedText
import SwiftUI
import Testing
@testable import SettingsUI

@MainActor
struct CallNotesInteractionTests {

    @Test(arguments: [ColorScheme.light, .dark])
    func detailsExpandAndCollapseWithoutChangingPreferences(scheme: ColorScheme) throws {
        var events: [SettingsEvent] = []
        let host = Offscreen.host(SettingsView(state: try preview("no-fallback"), event: { events.append($0) })
            .environment(\.colorScheme, scheme))
        _ = try #require(Offscreen.snapshot(host))
        let collapsedHeight = host.fittingSize.height
        try button("notes-details", in: host).performClick(nil)
        RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.1))
        _ = try #require(Offscreen.snapshot(host))
        #expect(host.fittingSize.height > collapsedHeight)
        try Offscreen.save(try #require(Offscreen.snapshot(host)), "settings-details-expanded-\(scheme == .dark ? "dark" : "light")")
        try button("notes-details", in: host).performClick(nil)
        RunLoop.main.run(until: Date(timeIntervalSinceNow: 0.1))
        #expect(abs(host.fittingSize.height - collapsedHeight) < 1)
        #expect(events.isEmpty)
    }

    @Test func tabsAndActionsSendEventsWithoutChangingTheRenderedState() throws {
        var events: [SettingsEvent] = []
        let host = try host("off") { events.append($0) }
        #expect(try button("tab-callNotes", in: host).accessibilityLabel() == "Итоги звонков")
        for (id, expected) in [
            ("tab-recording", SettingsEvent.selectTab(.recording)),
            ("tab-callNotes", .selectTab(.callNotes)),
            ("notes-automatic", .setAutomaticNotes(true)),
            ("notes-speakers", .setIdentifySpeakers(true)),
            ("notes-validate", .notesAction(.validate)),
            ("notes-save", .notesAction(.save)),
        ] {
            let control = try button(id, in: host)
            #expect(control.isAccessibilityElement())
            #expect(control.acceptsFirstResponder)
            control.performClick(nil)
            #expect(events.last == expected)
        }
        #expect(events.count == 6)
        #expect(try button("notes-automatic", in: host).state == .off)
        #expect(try button("notes-speakers", in: host).state == .off)
    }

    @Test func aNewStateUpdatesNativeValuesActionsAndAvailability() throws {
        var oldEvents: [SettingsEvent] = []
        var newEvents: [SettingsEvent] = []
        let host = Offscreen.host(SettingsView(state: try preview("off"), event: { oldEvents.append($0) }))
        _ = try #require(Offscreen.snapshot(host))
        host.rootView = SettingsView(state: try preview("on"), event: { newEvents.append($0) })
        _ = try #require(Offscreen.snapshot(host))
        #expect(try button("notes-automatic", in: host).state == .on)
        #expect(try button("notes-speakers", in: host).state == .on)
        try button("notes-speakers", in: host).performClick(nil)
        #expect(oldEvents.isEmpty)
        #expect(newEvents == [.setIdentifySpeakers(false)])
        host.rootView = SettingsView(state: try preview("saving"), event: { newEvents.append($0) })
        _ = try #require(Offscreen.snapshot(host))
        #expect(try button("notes-save", in: host).isEnabled == false)
        try button("notes-save", in: host).performClick(nil)
        #expect(newEvents == [.setIdentifySpeakers(false)])
    }

    @Test func checkedControlsSendFalse() throws {
        var events: [SettingsEvent] = []
        let host = try host("on") { events.append($0) }
        try button("notes-automatic", in: host).performClick(nil)
        try button("notes-speakers", in: host).performClick(nil)
        #expect(events == [.setAutomaticNotes(false), .setIdentifySpeakers(false)])
    }

    @Test func saveAndLoadFailuresSendDistinctRetryEvents() throws {
        var events: [SettingsEvent] = []
        let saveHost = try host("save-failed") { events.append($0) }
        try button("notes-retrySave", in: saveHost).performClick(nil)
        let loadHost = try host("load-failed") { events.append($0) }
        try button("notes-retryLoad", in: loadHost).performClick(nil)
        #expect(events == [.notesAction(.retrySave), .notesAction(.retryLoad)])
    }

    @Test(arguments: ["invalid", "validating", "saving", "saved"])
    func disabledSaveCannotSubmit(name: String) throws {
        var events: [SettingsEvent] = []
        let host = try host(name) { events.append($0) }
        let save = try button("notes-save", in: host)
        #expect(!save.isEnabled)
        save.performClick(nil)
        #expect(events.isEmpty)
        try button("notes-validate", in: host).performClick(nil)
        #expect(events == [.notesAction(.validate)])
    }

    @Test(arguments: ["loading", "load-failed"])
    func unloadedStatesHaveNoEditableRuntimeValues(name: String) throws {
        let host = try host(name) { _ in Issue.record("Unexpected input") }
        #expect(Offscreen.textFields(in: host).isEmpty)
        #expect(descendants(host, of: NSPopUpButton.self).isEmpty)
        #expect(descendants(host, of: NSButton.self).allSatisfy {
            ["tab-general", "tab-recording", "tab-callNotes", "notes-retryLoad"].contains($0.accessibilityIdentifier() ?? "")
        })
    }

    @Test(arguments: ["off", "on", "validating", "saving", "save-failed", "local"])
    func nativeTextEditsSendExactSlotFieldAndValue(name: String) throws {
        var events: [SettingsEvent] = []
        let state = try preview(name)
        let host = try host(name) { events.append($0) }
        guard case let .loaded(draft) = state.callNotes else { Issue.record("Missing draft"); return }
        // Native popup buttons also own label text fields. Identify editable
        // presentation fields by their public control identifiers.
        let fields = Offscreen.textFields(in: host).filter {
            $0.accessibilityIdentifier().hasPrefix("notes-")
        }
        let presented = draft.runtimes.flatMap { runtime in runtime.fields.map { (runtime.id, $0) } }
        #expect(fields.map(\.stringValue) == presented.map { $0.1.value })
        for (input, (slot, field)) in zip(fields, presented) {
            #expect(input.isEditable)
            #expect(input.font?.fontDescriptor.symbolicTraits.contains(.bold) == false, "\(String(describing: input.font))")
            let value: String = switch field.id {
            case .model: "my/model:2"
            case .executable: "/Applications/My CLI/claude"
            case .endpoint: "http://127.0.0.1:9000/v1"
            case .credentialVariable: "MY_API_KEY"
            }
            input.stringValue = value
            input.delegate?.controlTextDidChange?(Notification(name: NSControl.textDidChangeNotification, object: input))
            #expect(events.last == .editNotesField(slot, field.id, value))
        }
        #expect(events.count == presented.count)
    }

    @Test func clearingACredentialReferenceSendsAnEmptyName() throws {
        var events: [SettingsEvent] = []
        let host = try host("off") { events.append($0) }
        let input = try #require(Offscreen.textFields(in: host).first { $0.stringValue == "OPENAI_API_KEY" })
        input.stringValue = ""
        input.delegate?.controlTextDidChange?(Notification(name: NSControl.textDidChangeNotification, object: input))
        #expect(events == [.editNotesField(.fallback, .credentialVariable, "")])
    }

    @Test func nativeMenusSendProviderChoicesAndAllowOnlyFallbackToBeUnconfigured() throws {
        var events: [SettingsEvent] = []
        let host = try host("off") { events.append($0) }
        let menus = descendants(host, of: NSPopUpButton.self)
        #expect(menus.count == 2)
        for (menu, slot) in zip(menus, SettingsState.NotesRuntime.Slot.allCases) {
            let kinds: [SettingsState.NotesRuntime.Kind] = slot == .primary
                ? [.claudeCLI, .compatibleAPI] : [.unconfigured, .claudeCLI, .compatibleAPI]
            #expect(menu.numberOfItems == kinds.count)
            for (index, kind) in kinds.enumerated() {
                menu.selectItem(at: index)
                let item = try #require(menu.item(at: index))
                let action = try #require(item.action)
                NSApplication.shared.sendAction(action, to: item.target, from: item)
                #expect(events.last == .selectNotesRuntime(slot, kind))
            }
        }
        #expect(events.count == 5)
    }

    private func preview(_ name: String) throws -> SettingsState {
        try #require(SettingsState.summaryPreviews.first { $0.name == "summaries-\(name)" }?.state)
    }

    private func host(_ name: String, event: @escaping (SettingsEvent) -> Void) throws -> NSView {
        let host = Offscreen.host(SettingsView(state: try preview(name), event: event))
        _ = try #require(Offscreen.snapshot(host))
        host.layoutSubtreeIfNeeded()
        return host
    }

    private func button(_ id: String, in host: NSView) throws -> NSButton {
        try #require(descendants(host, of: NSButton.self).first { $0.accessibilityIdentifier() == id }, "Missing \(id)")
    }

    private func descendants<T: NSView>(_ view: NSView, of type: T.Type) -> [T] {
        (view as? T).map { [$0] } ?? view.subviews.flatMap { descendants($0, of: type) }
    }
}
