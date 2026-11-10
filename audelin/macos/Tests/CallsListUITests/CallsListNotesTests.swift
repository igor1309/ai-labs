import AppKit
import CallsListUI
import GlassLedger
import RenderedText
import SwiftUI
import Testing

/// SwiftUI takes clicks and keys only in a window on screen, and gives an
/// offscreen host no accessibility children, so these tests show the list
/// far off the visible screen, click and type into it, and read its pixels.
@MainActor
struct CallsListNotesTests {

    @Test(arguments: [ColorScheme.light, .dark])
    func theEyeShowsOnlyOnCallsWithNotesJustBeforeTheActions(scheme: ColorScheme) throws {

        let shown = Shown(makeState(), scheme: scheme)
        defer { shown.close() }
        let eyes = try shown.eyes()

        #expect(eyes.count == 2)
        let first = try #require(eyes.first), last = try #require(eyes.last)
        #expect(first.midY < last.midY)
        #expect(eyes.allSatisfy { $0.minX >= eyeColumn.lowerBound && $0.maxX <= eyeColumn.upperBound })
    }

    @Test func callsWithoutNotesKeepTheEyesPlace() throws {

        var none = makeState()
        for index in none.rows.indices { none.rows[index].hasNotes = false }
        let with = Shown(makeState()), without = Shown(none)
        defer { with.close(); without.close() }

        #expect(try without.eyes().isEmpty)
        #expect(try with.pixels(leftOf: eyeColumn.lowerBound) == without.pixels(leftOf: eyeColumn.lowerBound))
    }

    @Test func pressingAnEyeAsksForThatCallsNotes() throws {

        let shown = Shown(makeState())
        defer { shown.close() }
        let eye = try #require(try shown.eyes().last)

        shown.click(CGPoint(x: eye.midX, y: eye.midY))

        #expect(shown.sent == [.preview("2026.10.17-1100")])
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

    @Test(arguments: [ColorScheme.light, .dark])
    func theSelectedRowAndThePreviewedEyeShowAsSelected(scheme: ColorScheme) throws {

        var state = makeState()
        state.selectedID = state.rows[2].id
        state.previewedID = state.rows[2].id
        let selected = Shown(state, scheme: scheme), plain = Shown(makeState(), scheme: scheme)
        defer { selected.close(); plain.close() }
        let eyes = try plain.eyes()
        let first = try #require(eyes.first), last = try #require(eyes.last)

        #expect(try plain.color(at: CGPoint(x: 8, y: last.midY)) == selected.color(at: CGPoint(x: 8, y: first.midY)))
        #expect(try plain.color(at: CGPoint(x: 8, y: last.midY)) != selected.color(at: CGPoint(x: 8, y: last.midY)))
        #expect(try selected.isTinted(last))
        #expect(try !selected.isTinted(first))
        #expect(try !plain.isTinted(last))
    }

    // MARK: - Helpers

    /// The eye's place: the row's padding, then the actions and their spacing.
    private let eyeColumn: ClosedRange<CGFloat> = (920 - 24 - 170 - 12 - 28)...(920 - 24 - 170 - 12)

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

        func pixels(leftOf x: CGFloat) throws -> [NSColor?] {
            let image = try snapshot(), scale = CGFloat(image.pixelsWide) / 920
            return (0..<image.pixelsHigh).flatMap { y in (0..<Int(x * scale)).map { image.colorAt(x: $0, y: y) } }
        }

        func color(at point: CGPoint) throws -> NSColor? {
            let image = try snapshot(), scale = CGFloat(image.pixelsWide) / 920
            return image.colorAt(x: Int(point.x * scale), y: Int(point.y * scale))
        }

        /// Whether the box holds the accent's teal, which no grey reaches.
        func isTinted(_ box: CGRect) throws -> Bool {
            let image = try snapshot(), scale = CGFloat(image.pixelsWide) / 920
            return (Int(box.minY * scale)...Int(box.maxY * scale)).contains { y in
                (Int(box.minX * scale)...Int(box.maxX * scale)).contains { x in
                    guard let pixel = image.colorAt(x: x, y: y)?.usingColorSpace(.sRGB) else { return false }
                    return pixel.greenComponent - pixel.redComponent > 0.3
                }
            }
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

        let start = { ISO8601DateFormatter().date(from: $0)! }
        return CallsListState(rows: [
            .init(id: "2026.10.21-1230", title: "Запуск", start: start("2026-10-21T12:30:00Z"), duration: 2_820, timeZone: .gmt, editable: true, hasNotes: true),
            .init(id: "2026.10.20-1600", title: "Синк по OKR", start: start("2026-10-20T16:00:00Z"), duration: 4_320, timeZone: .gmt, editable: true),
            .init(id: "2026.10.17-1100", title: "", start: start("2026-10-17T11:00:00Z"), duration: nil, timeZone: .gmt, editable: true, hasNotes: true),
        ])
    }
}
