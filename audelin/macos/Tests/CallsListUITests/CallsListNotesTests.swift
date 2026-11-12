import AppKit
import CallsListUI
import GlassLedger
import SwiftUI
import Testing

/// What the view does itself with clicks and keys. SwiftUI takes clicks and
/// keys only in a window on screen and gives an offscreen host no
/// accessibility children, so these tests show the list far off the visible
/// screen, find rows by their identifiers, and click and type into it.
@MainActor
struct CallsListNotesTests {

    @Test func clickingARowsTitleOnlySelectsIt() throws {

        let shown = Shown(makeState())
        defer { shown.close() }
        let row = try #require(shown.row("2026.10.20-1600"))

        shown.click(CGPoint(x: 200, y: row.midY))

        #expect(shown.sent == [.select("2026.10.20-1600")])
    }

    @Test func clickingARowSelectsIt() throws {

        let shown = Shown(makeState())
        defer { shown.close() }
        let row = try #require(shown.row("2026.10.20-1600"))

        shown.click(CGPoint(x: 60, y: row.midY))

        #expect(shown.sent == [.select("2026.10.20-1600")])
    }

    @Test func arrowKeysStepTheSelection() throws {

        var state = makeState()
        state.selectedID = state.rows[1].id
        let shown = Shown(state)
        defer { shown.close() }

        shown.press(NSDownArrowFunctionKey, code: 125)
        shown.press(NSUpArrowFunctionKey, code: 126)

        #expect(shown.sent == [.selectNext, .selectPrevious])
    }

    @Test func keysActOnTheSelectedCall() throws {

        var state = makeState()
        state.selectedID = state.rows[0].id
        let shown = Shown(state)
        defer { shown.close() }

        shown.type("\r", code: 36)
        shown.type(" ", code: 49)
        shown.type("r", code: 15, modifiers: .command)
        shown.type("\u{7F}", code: 51, modifiers: .command)
        shown.type("r", code: 15)

        let id = state.rows[0].id
        #expect(shown.sent == [.open(id), .beginRename(id), .askDelete(id)])
    }

    @Test func inANarrowWindowReturnAndSpaceReadTheCall() throws {

        var state = makeState()
        state.selectedID = state.rows[1].id
        state.narrow = true
        let shown = Shown(state)
        defer { shown.close() }

        shown.type("\r", code: 36)
        shown.type(" ", code: 49)

        let id = state.rows[1].id
        #expect(shown.sent == [.read(id), .read(id)])
    }

    @Test func keysSkipWhatTheSelectedCallCannotDo() throws {

        var state = makeState()
        state.selectedID = state.rows[1].id
        state.rows[1] = .init(id: state.rows[1].id, title: "Синк", displayTitle: "Синк", day: nil, time: "16:00", duration: "1:12:00", editable: false)
        let shown = Shown(state)
        defer { shown.close() }

        shown.type(" ", code: 49)
        shown.type("r", code: 15, modifiers: .command)
        shown.type("\u{7F}", code: 51, modifiers: .command)

        #expect(shown.sent.isEmpty)
    }

    // MARK: - Helpers

    @MainActor private final class Shown {
        private(set) var sent: [CallsListEvent] = []
        private var window: NSWindow!
        private let scheme: ColorScheme

        init(_ state: CallsListState, scheme: ColorScheme = .light) {
            self.scheme = scheme
            GlassLedger.registerFonts()
            window = QuietWindow(contentRect: NSRect(x: -30_000, y: -30_000, width: 920, height: 420),
                              styleMask: .borderless, backing: .buffered, defer: false)
            window.isReleasedWhenClosed = false
            window.appearance = NSAppearance(named: scheme == .dark ? .darkAqua : .aqua)
            window.contentView = NSHostingView(rootView: CallsListView(state: state, text: .init(language: .russian), event: { [weak self] in self?.sent.append($0) })
                .environment(\.colorScheme, scheme))
            window.orderFrontRegardless()
            window.makeKey()
            settle()
        }

        func close() { window.close() }

        func settle() { RunLoop.main.run(until: Date() + 0.15) }

        /// The row's box in view points from the top left, found by its identifier.
        func row(_ id: String) -> CGRect? {
            guard let content = window.contentView, let target = find("calls.row.\(id)", in: content) else { return nil }
            let box = target.convert(target.bounds, to: nil)
            return CGRect(x: box.minX, y: 420 - box.maxY, width: box.width, height: box.height)
        }

        private func find(_ identifier: String, in view: NSView) -> NSView? {
            if view.accessibilityIdentifier() == identifier { return view }
            return view.subviews.lazy.compactMap { self.find(identifier, in: $0) }.first
        }

        func click(_ point: CGPoint) {
            let location = NSPoint(x: point.x, y: 420 - point.y)
            for type in [NSEvent.EventType.leftMouseDown, .leftMouseUp] {
                window.sendEvent(NSEvent.mouseEvent(with: type, location: location, modifierFlags: [],
                                                    timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber,
                                                    context: nil, eventNumber: 0, clickCount: 1, pressure: 1)!)
            }
            settle()
        }

        func press(_ key: Int, code: UInt16) {
            let characters = String(Character(UnicodeScalar(key)!))
            window.sendEvent(NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: [.function, .numericPad],
                                              timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber,
                                              context: nil, characters: characters, charactersIgnoringModifiers: characters,
                                              isARepeat: false, keyCode: code)!)
            settle()
        }

        func type(_ characters: String, code: UInt16, modifiers: NSEvent.ModifierFlags = []) {
            window.sendEvent(NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: modifiers,
                                              timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber,
                                              context: nil, characters: characters, charactersIgnoringModifiers: characters,
                                              isARepeat: false, keyCode: code)!)
            settle()
        }
    }

    /// A key the list ignores ends at the window, whose `noResponder(for:)`
    /// plays the system alert; the test checks only that no event was sent.
    private final class QuietWindow: NSWindow {
        override func noResponder(for eventSelector: Selector) {}
    }

    private func makeState() -> CallsListState {

        return CallsListState(rows: [
            .init(id: "2026.10.21-1230", title: "Запуск", displayTitle: "Запуск", day: .init(title: "Сегодня", count: "1 звонок"), time: "12:30", duration: "47:00", editable: true, hasNotes: true),
            .init(id: "2026.10.20-1600", title: "Синк по OKR", displayTitle: "Синк по OKR", day: .init(title: "Вчера", count: "1 звонок"), time: "16:00", duration: "1:12:00", editable: true),
            .init(id: "2026.10.17-1100", title: "", displayTitle: "2026.10.17-1100", day: .init(title: "Пятница, 17 октября", count: "1 звонок"), time: "11:00", duration: "—", editable: true, hasNotes: true),
        ])
    }
}
