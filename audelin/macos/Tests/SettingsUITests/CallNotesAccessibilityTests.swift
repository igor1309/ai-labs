import AppKit
import RenderedText
import SwiftUI
import Testing
@testable import SettingsUI

@MainActor
struct CallNotesAccessibilityTests {
    @Test func tabsAreOneKeyboardStopWithRadioTabsThatFollowTheSuppliedSelection() throws {
        var events: [SettingsEvent] = []
        var state = try #require(SettingsState.summaryPreviews.first?.state)
        let host = Offscreen.host(SettingsView(state: state, event: { events.append($0) }))
        let window = try #require(host.window)
        _ = try #require(Offscreen.snapshot(host))
        let tabs = try segments("tabs", in: host)
        #expect(tabs.accessibilityRole() == .radioGroup)
        #expect(tabs.acceptsFirstResponder)
        #expect(tabs.canBecomeKeyView)
        #expect(tabs.focusRingType == .none)
        #expect(try tab("tab-callNotes", in: tabs).accessibilityLabel() == "Итоги звонков")
        #expect(try tab("tab-recording", in: tabs).accessibilityRole() == .radioButton)
        #expect(try selected(in: tabs) == ["tab-callNotes"])
        #expect(window.makeFirstResponder(tabs))
        tabs.keyDown(with: try arrow(.leftArrow, window))
        #expect(events == [.selectTab(.recording)])
        #expect(try selected(in: tabs) == ["tab-callNotes"])
        #expect(try tab("tab-general", in: tabs).accessibilityPerformPress())
        #expect(try tab("tab-callNotes", in: tabs).accessibilityPerformPress())
        #expect(events == [.selectTab(.recording), .selectTab(.general)])
        state.selectedTab = .recording
        host.rootView = SettingsView(state: state, event: { events.append($0) })
        _ = try #require(Offscreen.snapshot(host))
        #expect(try selected(in: try segments("tabs", in: host)) == ["tab-recording"])
    }

    @Test func sectionTabsStayVisibleAndActionableAfterScrolling() throws {
        var events: [SettingsEvent] = []
        let state = try #require(SettingsState.summaryPreviews.first?.state)
        let host = Offscreen.host(
            SettingsScrollView(state: state, event: { events.append($0) })
                .frame(height: 300)
        )
        host.window?.isReleasedWhenClosed = false
        defer { host.window?.close() }
        _ = try #require(Offscreen.snapshot(host))
        let tabs = try segments("tabs", in: host)
        let originalFrame = tabs.convert(tabs.bounds, to: host)
        let scroll = try #require(descendants(host).compactMap { $0 as? NSScrollView }.first)
        let document = try #require(scroll.documentView)
        #expect(document.bounds.height > scroll.contentView.bounds.height)
        #expect(!descendants(document).contains { $0 === tabs })
        let originalOffset = scroll.contentView.bounds.origin
        document.scroll(NSPoint(x: 0, y: document.bounds.height))
        scroll.reflectScrolledClipView(scroll.contentView)
        _ = try #require(Offscreen.snapshot(host))
        #expect(scroll.contentView.bounds.origin != originalOffset)
        #expect(tabs.convert(tabs.bounds, to: host) == originalFrame)
        #expect(host.bounds.contains(originalFrame))
        #expect(try selected(in: tabs) == ["tab-callNotes"])
        #expect(try tab("tab-recording", in: tabs).accessibilityPerformPress())
        #expect(events == [.selectTab(.recording)])
    }

    private func segments(_ id: String, in view: NSView) throws -> SegmentsView {
        try #require(descendants(view).compactMap { $0 as? SegmentsView }.first { $0.accessibilityIdentifier() == id })
    }

    private func tab(_ id: String, in tabs: SegmentsView) throws -> NSAccessibilityElement {
        try #require(radios(tabs).first { $0.accessibilityIdentifier() == id }, "Missing \(id)")
    }

    private func selected(in tabs: SegmentsView) throws -> [String] {
        radios(tabs).filter { ($0.accessibilityValue() as? NSNumber)?.boolValue == true }.compactMap { $0.accessibilityIdentifier() }
    }

    private func radios(_ tabs: SegmentsView) -> [NSAccessibilityElement] {
        (tabs.accessibilityChildren() ?? []).compactMap { $0 as? NSAccessibilityElement }
    }

    private func arrow(_ key: NSEvent.SpecialKey, _ window: NSWindow) throws -> NSEvent {
        let character = String(Character(UnicodeScalar(key.rawValue)!))
        return try #require(NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: [], timestamp: 0,
                                             windowNumber: window.windowNumber, context: nil, characters: character,
                                             charactersIgnoringModifiers: character, isARepeat: false,
                                             keyCode: key == .leftArrow ? 123 : 124))
    }

    private func descendants(_ view: NSView) -> [NSView] { [view] + view.subviews.flatMap(descendants) }
}
