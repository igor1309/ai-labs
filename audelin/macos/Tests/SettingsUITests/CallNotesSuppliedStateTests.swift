import AppKit
import Observation
import RenderedText
import SwiftUI
import Testing
@testable import SettingsUI

@MainActor
struct CallNotesSuppliedStateTests {
    typealias Kind = SettingsState.NotesRuntime.Kind

    @Test(arguments: [Kind.claudeCLI, .compatibleAPI], [Kind.claudeCLI, .compatibleAPI])
    func bothSlotsRenderInitialAndReplacementValues(primary: Kind, fallback: Kind) throws {
        var state = try state(primary: primary, fallback: fallback)
        let host = Offscreen.host(SettingsView(state: state, event: { _ in Issue.record("Unexpected event") }))
        try assertValues(state, in: host)
        state = try self.state(primary: opposite(primary), fallback: opposite(fallback))
        try changeDraft(&state) { draft in
            for r in draft.runtimes.indices {
                for f in draft.runtimes[r].fields.indices {
                    draft.runtimes[r].fields[f].value = "replacement-\(r)-\(f)-é"
                }
            }
        }
        host.rootView = SettingsView(state: state, event: { _ in Issue.record("Unexpected event") })
        try assertValues(state, in: host)
    }

    @Test func repeatedIgnoredInputRestoresEveryFieldAndMenuAndUsesUpdatedCallbacks() async throws {
        var oldEvents: [SettingsEvent] = []
        var newEvents: [SettingsEvent] = []
        var state = try state(primary: .claudeCLI, fallback: .compatibleAPI)
        let host = Offscreen.host(SettingsView(state: state, event: { oldEvents.append($0) }))
        try assertValues(state, in: host)
        var expected: [SettingsEvent] = []
        for _ in 0..<2 {
            for runtime in try draft(state).runtimes {
                let menu = try menu(runtime.id, in: host)
                let proposed = opposite(runtime.kind)
                try choose(proposed, in: menu)
                expected.append(.selectNotesRuntime(runtime.id, proposed))
                for field in runtime.fields {
                    let input = try input(runtime.id, field.id, in: host)
                    edit(input, to: "ignored \(field.id.rawValue)")
                    expected.append(.editNotesField(runtime.id, field.id, "ignored \(field.id.rawValue)"))
                }
            }
            try assertValues(state, in: host)
        }
        await finishInputTurn()
        #expect(oldEvents == expected)
        try changeDraft(&state) { $0.status = "Changed status, same supplied fields" }
        host.rootView = SettingsView(state: state, event: { newEvents.append($0) })
        try assertValues(state, in: host)
        let field = try input(.primary, .model, in: host)
        edit(field, to: "new callback")
        try choose(.claudeCLI, in: menu(.fallback, in: host))
        try assertValues(state, in: host)
        await finishInputTurn()
        #expect(oldEvents == expected)
        #expect(newEvents == [.editNotesField(.primary, .model, "new callback"),
                              .selectNotesRuntime(.fallback, .claudeCLI)])
    }

    @Test(arguments: ["accept", "normalize", "reject"])
    func activeEditorRendersCallerDecisionWithoutExtraEventsOrCaretReset(decision: String) async throws {
        var state = try state(primary: .claudeCLI, fallback: .compatibleAPI)
        var events: [SettingsEvent] = []
        weak var currentHost: NSHostingView<SettingsView>?
        let host = Offscreen.host(SettingsView(state: state, event: { event in
            events.append(event)
            guard case let .editNotesField(_, _, value) = event else { return }
            do {
                try changeDraft(&state) {
                    if decision != "reject" {
                        $0.runtimes[0].fields[0].value = decision == "normalize" ? value.uppercased() : value
                    }
                    $0.status = "Decision supplied"
                }
                currentHost?.rootView = SettingsView(state: state, event: { events.append($0) })
            } catch { Issue.record(error) }
        }))
        currentHost = host
        _ = try #require(Offscreen.snapshot(host))
        let field = try input(.primary, .model, in: host)
        field.selectText(nil)
        let editor = try #require(field.currentEditor() as? NSTextView)
        editor.setSelectedRange(NSRange(location: 2, length: 0))
        editor.insertText("x", replacementRange: editor.selectedRange())
        _ = try #require(Offscreen.snapshot(host))
        await finishInputTurn()
        let expected = decision == "accept" ? "soxnnet" : decision == "normalize" ? "SOXNNET" : "sonnet"
        #expect(field.stringValue == expected)
        #expect(editor.string == expected)
        #expect(editor.selectedRange() == NSRange(location: 3, length: 0))
        #expect(events == [.editNotesField(.primary, .model, "soxnnet")])
        host.window?.makeFirstResponder(nil)
    }

    @Test func typingThroughObservedStateKeepsTextAndCaretInOrder() async throws {
        var initial = try state(primary: .claudeCLI, fallback: .compatibleAPI)
        try changeDraft(&initial) { $0.runtimes[0].fields[0].value = "opus" }
        let model = TypingModel(state: initial)
        let host = Offscreen.host(TypingView(model: model))
        // Offscreen.host returns the content view; retain its window across awaits.
        let window = try #require(host.window)
        defer { window.makeFirstResponder(nil) }
        _ = try #require(Offscreen.snapshot(host))
        let field = try input(.primary, .model, in: host)
        field.selectText(nil)
        let editor = try #require(field.currentEditor() as? NSTextView)
        editor.setSelectedRange(NSRange(location: 4, length: 0))
        var expected = "opus"
        for character in "ab" {
            editor.insertText(String(character), replacementRange: editor.selectedRange())
            // Exercise layout before the observed SwiftUI update is delivered.
            field.layoutSubtreeIfNeeded()
            _ = try #require(Offscreen.snapshot(host))
            expected.append(character)
            #expect(editor.string == expected)
            #expect(editor.selectedRange() == NSRange(location: expected.utf16.count, length: 0))
            await finishInputTurn()
            await (try #require(model.pending)).value
            _ = try #require(Offscreen.snapshot(host))
            #expect(try draft(model.state).runtimes[0].fields[0].value == expected)
            #expect(field.stringValue == expected)
            #expect(editor.string == expected)
            #expect(editor.selectedRange() == NSRange(location: (expected as NSString).length, length: 0))
        }
        editor.setSelectedRange(NSRange(location: 0, length: editor.string.utf16.count))
        editor.insertText("claude-sonnet-4-5", replacementRange: editor.selectedRange())
        _ = try #require(Offscreen.snapshot(host))
        await finishInputTurn()
        await (try #require(model.pending)).value
        _ = try #require(Offscreen.snapshot(host))
        editor.setSelectedRange(NSRange(location: 7, length: 6))
        editor.insertText("opus", replacementRange: editor.selectedRange())
        _ = try #require(Offscreen.snapshot(host))
        await finishInputTurn()
        await (try #require(model.pending)).value
        _ = try #require(Offscreen.snapshot(host))
        #expect(editor.string == "claude-opus-4-5")
        #expect(editor.selectedRange() == NSRange(location: 11, length: 0))
        editor.deleteBackward(nil)
        _ = try #require(Offscreen.snapshot(host))
        await finishInputTurn()
        await (try #require(model.pending)).value
        _ = try #require(Offscreen.snapshot(host))
        #expect(editor.string == "claude-opu-4-5")
        #expect(editor.selectedRange() == NSRange(location: 10, length: 0))
        host.window?.makeFirstResponder(nil)
    }

    @Observable @MainActor
    final class TypingModel {
        var state: SettingsState
        @ObservationIgnored var pending: Task<Void, Never>?
        init(state: SettingsState) { self.state = state }
        func enqueue(_ event: SettingsEvent) {
            pending = Task { send(event) }
        }
        func send(_ event: SettingsEvent) {
            guard case let .editNotesField(slot, field, value) = event,
                  case var .loaded(draft) = state.callNotes,
                  let r = draft.runtimes.firstIndex(where: { $0.id == slot }),
                  let f = draft.runtimes[r].fields.firstIndex(where: { $0.id == field }) else { return }
            draft.runtimes[r].fields[f].value = value
            state.callNotes = .loaded(draft)
        }
    }

    private struct TypingView: View {
        var model: TypingModel
        var body: some View { SettingsView(state: model.state, event: model.enqueue) }
    }

    @Test func acceptedMenuSelectionAndSubsequentActionsUseReplacementState() async throws {
        var events: [SettingsEvent] = []
        var state = try state(primary: .claudeCLI, fallback: .compatibleAPI)
        weak var currentHost: NSHostingView<SettingsView>?
        let host = Offscreen.host(SettingsView(state: state, event: { event in
            events.append(event)
            do {
                state = try self.state(primary: .compatibleAPI, fallback: .claudeCLI)
                currentHost?.rootView = SettingsView(state: state, event: { events.append($0) })
            } catch { Issue.record(error) }
        }))
        currentHost = host
        _ = try #require(Offscreen.snapshot(host))
        try choose(.compatibleAPI, in: menu(.primary, in: host))
        try assertValues(state, in: host)
        try choose(.compatibleAPI, in: menu(.fallback, in: host))
        try assertValues(state, in: host)
        await finishInputTurn()
        #expect(events == [.selectNotesRuntime(.primary, .compatibleAPI), .selectNotesRuntime(.fallback, .compatibleAPI)])
    }

    @Test func disabledFieldsAndValidateStayUnavailableUntilStateEnablesThem() throws {
        var state = try state(primary: .claudeCLI, fallback: .compatibleAPI)
        try changeDraft(&state) {
            $0.validate.isEnabled = false
            for r in $0.runtimes.indices {
                for f in $0.runtimes[r].fields.indices { $0.runtimes[r].fields[f].isEnabled = false }
            }
        }
        var events: [SettingsEvent] = []
        let host = Offscreen.host(SettingsView(state: state, event: { events.append($0) }))
        try assertValues(state, in: host)
        try button("notes-validate", in: host).performClick(nil)
        #expect(events.isEmpty)
        try changeDraft(&state) {
            $0.validate.isEnabled = true
            for r in $0.runtimes.indices {
                for f in $0.runtimes[r].fields.indices { $0.runtimes[r].fields[f].isEnabled = true }
            }
        }
        host.rootView = SettingsView(state: state, event: { events.append($0) })
        try assertValues(state, in: host)
        try button("notes-validate", in: host).performClick(nil)
        #expect(events == [.notesAction(.validate)])
    }

    private func state(primary: Kind, fallback: Kind) throws -> SettingsState {
        var state = try #require(SettingsState.summaryPreviews.first?.state)
        let samples = try draft(state).runtimes
        try changeDraft(&state) { draft in
            draft.runtimes = zip(SettingsState.NotesRuntime.Slot.allCases, [primary, fallback]).map { slot, kind in
                var runtime = samples.first { $0.kind == kind }!
                runtime.id = slot
                runtime.title = slot == .primary ? "Основной сервис" : "Резервный сервис"
                return runtime
            }
        }
        return state
    }

    private func draft(_ state: SettingsState) throws -> SettingsState.NotesDraft {
        guard case let .loaded(draft) = state.callNotes else { throw MissingDraft() }
        return draft
    }

    private struct MissingDraft: Error {}

    private func changeDraft(_ state: inout SettingsState, _ change: (inout SettingsState.NotesDraft) -> Void) throws {
        var value = try draft(state)
        change(&value)
        state.callNotes = .loaded(value)
    }

    private func opposite(_ kind: Kind) -> Kind { kind == .claudeCLI ? .compatibleAPI : .claudeCLI }

    private func assertValues(_ state: SettingsState, in host: NSView) throws {
        _ = try #require(Offscreen.snapshot(host))
        let draft = try draft(state)
        for runtime in draft.runtimes {
            let menu = try menu(runtime.id, in: host)
            #expect(menu.isBordered)
            #expect(!menu.pullsDown)
            let cell = try #require(menu.cell as? NSPopUpButtonCell)
            #expect(cell.arrowPosition != .noArrow)
            #expect(menu.selectedItem?.representedObject as? String == runtime.kind.rawValue)
            #expect(menu.titleOfSelectedItem == runtime.options.first { $0.id == runtime.kind }?.title)
            for field in runtime.fields {
                let input = try input(runtime.id, field.id, in: host)
                #expect(input.stringValue == field.value)
                #expect(input.isEnabled == field.isEnabled)
                #expect(input.isEditable == field.isEnabled)
                #expect(input.placeholderString == field.placeholder)
            }
        }
        #expect(try button("notes-validate", in: host).isEnabled == draft.validate.isEnabled)
    }

    private func edit(_ input: NSTextField, to value: String) {
        input.stringValue = value
        input.delegate?.controlTextDidChange?(Notification(name: NSControl.textDidChangeNotification, object: input))
    }

    private func choose(_ kind: Kind, in menu: NSPopUpButton) throws {
        let item = try #require(menu.itemArray.first { $0.representedObject as? String == kind.rawValue })
        menu.select(item)
        NSApplication.shared.sendAction(try #require(item.action), to: item.target, from: item)
    }

    private func input(_ slot: SettingsState.NotesRuntime.Slot, _ field: SettingsState.NotesField.ID, in host: NSView) throws -> NSTextField {
        try control("notes-\(slot.rawValue)-\(field.rawValue)", in: host, as: NSTextField.self)
    }

    private func menu(_ slot: SettingsState.NotesRuntime.Slot, in host: NSView) throws -> NSPopUpButton {
        try control("notes-\(slot.rawValue)-kind", in: host, as: NSPopUpButton.self)
    }

    private func button(_ id: String, in host: NSView) throws -> NSButton { try control(id, in: host, as: NSButton.self) }

    private func control<T: NSView>(_ id: String, in host: NSView, as type: T.Type) throws -> T {
        try #require(descendants(host).first { ($0 as? T)?.accessibilityIdentifier() == id } as? T, "Missing \(id)")
    }

    private func descendants(_ view: NSView) -> [NSView] { [view] + view.subviews.flatMap(descendants) }

    private func finishInputTurn() async {
        await withCheckedContinuation { continuation in
            DispatchQueue.main.async { continuation.resume() }
        }
    }
}
