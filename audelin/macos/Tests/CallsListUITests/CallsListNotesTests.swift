import AppKit
import CallsListUI
import GlassLedger
import RenderedText
import SwiftUI
import Testing

/// What the view does itself with clicks and keys. SwiftUI takes clicks and
/// keys only in a window on screen and gives an offscreen host no
/// accessibility children, so these tests show the list far off the visible
/// screen, find the eyes by their pixels, and click and type into it.
@MainActor
struct CallsListNotesTests {

    @Test func pressingAnEyeAsksForThatCallsNotes() throws {

        let shown = Shown(makeState())
        defer { shown.close() }
        let eye = try #require(try shown.eyes().last)

        shown.click(CGPoint(x: eye.midX, y: eye.midY))

        #expect(shown.sent == [.preview("2026.10.17-1100")])
    }

    @Test func retryButtonAsksForThatInterruptedCallWithoutStartingRename() throws {
        var state = makeState()
        state.rows[0].summaryStatus = "Подготовка итогов прервана"
        state.rows[0].canRetrySummary = true
        let shown = Shown(state)
        defer { shown.close() }
        let eye = try #require(try shown.eyes().first)
        shown.click(CGPoint(x: 260, y: eye.midY + 18))
        #expect(shown.sent == [.retrySummary("2026.10.21-1230")])
    }

    @Test func clickingARowsTitleSelectsItAndStartsItsRename() throws {

        let shown = Shown(makeState())
        defer { shown.close() }
        let eyes = try shown.eyes()
        let first = try #require(eyes.first), last = try #require(eyes.last)

        shown.click(CGPoint(x: 200, y: (first.midY + last.midY) / 2))

        #expect(shown.sent == [.select("2026.10.20-1600"), .beginRename("2026.10.20-1600")])
    }

    @Test func clickingARowSelectsIt() throws {

        let shown = Shown(makeState())
        defer { shown.close() }
        let eyes = try shown.eyes()
        let first = try #require(eyes.first), last = try #require(eyes.last)
        let middle = (first.midY + last.midY) / 2

        shown.click(CGPoint(x: 60, y: middle))

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

    // MARK: - Helpers

    @MainActor private final class Shown {
        private(set) var sent: [CallsListEvent] = []
        private var window: NSWindow!
        private let scheme: ColorScheme

        init(_ state: CallsListState, scheme: ColorScheme = .light) {
            self.scheme = scheme
            GlassLedger.registerFonts()
            window = NSWindow(contentRect: NSRect(x: -30_000, y: -30_000, width: 920, height: 420),
                              styleMask: .borderless, backing: .buffered, defer: false)
            window.isReleasedWhenClosed = false
            window.appearance = NSAppearance(named: scheme == .dark ? .darkAqua : .aqua)
            window.contentView = NSHostingView(rootView: CallsListView(state: state, event: { [weak self] in self?.sent.append($0) })
                .environment(\.colorScheme, scheme))
            window.orderFrontRegardless()
            window.makeKey()
            settle()
        }

        func close() { window.close() }

        func settle() { RunLoop.main.run(until: Date() + 0.15) }

        /// Each eye's box, top-down, in view points from the top left.
        func eyes() throws -> [CGRect] {
            let image = try snapshot(), scale = CGFloat(image.pixelsWide) / 920
            let background = { (y: Int) in image.colorAt(x: Int(670 * scale), y: y) }
            var boxes: [CGRect] = []
            for y in 0..<image.pixelsHigh {
                let xs = (Int(686 * scale)..<Int(714 * scale)).filter { image.colorAt(x: $0, y: y) != background(y) }
                guard let low = xs.min(), let high = xs.max() else { continue }
                let row = CGRect(x: CGFloat(low) / scale, y: CGFloat(y) / scale, width: CGFloat(high - low + 1) / scale, height: 1 / scale)
                if let last = boxes.last, row.minY - last.maxY < 2 { boxes[boxes.count - 1] = last.union(row) } else { boxes.append(row) }
            }
            return boxes.filter { $0.height > 4 }
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

        private func snapshot() throws -> NSBitmapImageRep {
            let view = try #require(window.contentView)
            return try #require(Offscreen.snapshot(view))
        }
    }

    private func makeState() -> CallsListState {

        return CallsListState(rows: [
            .init(id: "2026.10.21-1230", title: "Запуск", displayTitle: "Запуск", date: "21.10 · 12:30", duration: "47:00", editable: true, hasNotes: true),
            .init(id: "2026.10.20-1600", title: "Синк по OKR", displayTitle: "Синк по OKR", date: "20.10 · 16:00", duration: "1:12:00", editable: true),
            .init(id: "2026.10.17-1100", title: "", displayTitle: "2026.10.17-1100", date: "17.10 · 11:00", duration: "—", editable: true, hasNotes: true),
        ])
    }
}
