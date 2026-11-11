import AppKit
import RenderedText
import SwiftUI
import Testing
@testable import SettingsUI

@MainActor
struct GeneralInteractionTests {

    @Test func pressingALanguageSegmentSelectsIt() throws {
        var events: [SettingsEvent] = []
        let host = try host("general-system") { events.append($0) }
        let language = try segments("language", in: host)
        #expect(language.accessibilityRole() == .radioGroup)
        try press("language-english", in: language)
        try press("language-system", in: language)
        #expect(events == [.selectLanguage(.english)])
    }

    @Test func arrowKeysMoveToTheNextSegment() throws {
        var events: [SettingsEvent] = []
        let host = try host("general-russian") { events.append($0) }
        let language = try segments("language", in: host)
        #expect(language.acceptsFirstResponder)
        language.keyDown(with: try arrow(.rightArrow))
        language.keyDown(with: try arrow(.leftArrow))
        #expect(events == [.selectLanguage(.english), .selectLanguage(.system)])
    }

    @Test func pressingAnAppearanceSegmentSelectsIt() throws {
        var events: [SettingsEvent] = []
        let host = try host("general-system") { events.append($0) }
        let appearance = try segments("appearance", in: host)
        try press("appearance-dark", in: appearance)
        appearance.keyDown(with: try arrow(.rightArrow))
        #expect(events == [.selectAppearance(.dark), .selectAppearance(.light)])
    }

    private func host(_ name: String, event: @escaping (SettingsEvent) -> Void) throws -> NSView {
        let state = try #require(SettingsState.previews.first { $0.name == name }?.state)
        let host = Offscreen.host(SettingsView(state: state, event: event))
        _ = try #require(Offscreen.snapshot(host))
        host.layoutSubtreeIfNeeded()
        return host
    }

    private func segments(_ id: String, in view: NSView) throws -> SegmentsView {
        try #require(descendants(view).first { $0.accessibilityIdentifier() == id }, "Missing \(id)")
    }

    private func press(_ id: String, in segments: SegmentsView, succeeds: Bool = true) throws {
        let element = try #require((segments.accessibilityChildren() ?? []).compactMap { $0 as? NSAccessibilityElement }
            .first { $0.accessibilityIdentifier() == id }, "Missing \(id)")
        #expect(element.accessibilityPerformPress() == succeeds)
    }

    private func arrow(_ key: NSEvent.SpecialKey) throws -> NSEvent {
        let character = String(Character(UnicodeScalar(key.rawValue)!))
        return try #require(NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: [], timestamp: 0, windowNumber: 0,
                                             context: nil, characters: character, charactersIgnoringModifiers: character,
                                             isARepeat: false, keyCode: key == .leftArrow ? 123 : 124))
    }

    private func descendants(_ view: NSView) -> [SegmentsView] {
        (view as? SegmentsView).map { [$0] } ?? view.subviews.flatMap(descendants)
    }
}
