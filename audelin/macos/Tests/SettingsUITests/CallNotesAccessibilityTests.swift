import AppKit
import RenderedText
import SwiftUI
import Testing
@testable import SettingsUI

@MainActor
struct CallNotesAccessibilityTests {
    @Test func nativeTabsExposeSuppliedSelectionAndKeepButtonKeyboardAndAXActions() throws {
        var events: [SettingsEvent] = []
        var state = try #require(SettingsState.summaryPreviews.first?.state)
        let host = Offscreen.host(SettingsView(state: state, event: { events.append($0) }))
        let window = try #require(host.window)
        window.styleMask = [.titled]
        window.setAccessibilityElement(true)
        window.orderFront(nil)
        defer { window.orderOut(nil) }
        _ = try #require(Offscreen.snapshot(host))
        let recording = try button("tab-recording", in: host)
        let notes = try button("tab-callNotes", in: host)
        let checkbox = try button("notes-automatic", in: host)
        let action = try button("notes-validate", in: host)
        let baseline = NSButton(title: "Baseline", target: nil, action: nil)
        baseline.frame = NSRect(x: 0, y: 0, width: 80, height: 24)
        host.addSubview(baseline)
        defer { baseline.removeFromSuperview() }
        // AppKit can report AXUnknown for every NSButton in a non-AX host.
        // Compare native contracts in the same live window instead of requiring
        // a role that depends on the test process's AX integration.
        for control in [recording, notes, action] {
            #expect(control.accessibilityRole() == baseline.accessibilityRole())
            #expect(control.cell is NSButtonCell)
            #expect(control.state == .off)
            #expect(control.isAccessibilityElement())
            #expect(control.focusRingType == .exterior)
        }
        let baselineCheckbox = NSButton(checkboxWithTitle: "Baseline checkbox", target: nil, action: nil)
        host.addSubview(baselineCheckbox)
        defer { baselineCheckbox.removeFromSuperview() }
        #expect(checkbox.accessibilityRole() == baselineCheckbox.accessibilityRole())
        #expect(checkbox.cell is NSButtonCell)
        #expect(checkbox.accessibilityValue() as? Int == 0)
        #expect(!recording.isAccessibilitySelected())
        #expect(notes.isAccessibilitySelected())
        #expect(window.makeFirstResponder(recording))
        let space = try #require(NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: [], timestamp: 0,
                                                 windowNumber: window.windowNumber, context: nil,
                                                 characters: " ", charactersIgnoringModifiers: " ", isARepeat: false, keyCode: 49))
        recording.keyDown(with: space)
        #expect(events == [.selectTab(.recording)])
        #expect(!recording.isAccessibilitySelected())
        #expect(notes.isAccessibilitySelected())
        #expect(notes.accessibilityPerformPress())
        #expect(events == [.selectTab(.recording), .selectTab(.callNotes)])
        state.selectedTab = .recording
        host.rootView = SettingsView(state: state, event: { events.append($0) })
        _ = try #require(Offscreen.snapshot(host))
        #expect(try button("tab-recording", in: host).isAccessibilitySelected())
        #expect(try !button("tab-callNotes", in: host).isAccessibilitySelected())
        state.selectedTab = .callNotes
        host.rootView = SettingsView(state: state, event: { events.append($0) })
        _ = try #require(Offscreen.snapshot(host))
        #expect(try !button("tab-recording", in: host).isAccessibilitySelected())
        #expect(try button("tab-callNotes", in: host).isAccessibilitySelected())
    }

    private func button(_ id: String, in view: NSView) throws -> NSButton {
        try #require(descendants(view).compactMap { $0 as? NSButton }.first { $0.accessibilityIdentifier() == id })
    }

    private func descendants(_ view: NSView) -> [NSView] { [view] + view.subviews.flatMap(descendants) }
}
