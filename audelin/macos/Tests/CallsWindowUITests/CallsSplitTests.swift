import AppKit
import CallsWindowUI
import Testing

@MainActor
struct CallsSplitTests {
    @Test func theListStartsAt340AndTheDividerStaysBetween280And420() throws {
        let (window, split) = try show(width: 1000)
        defer { window.close() }
        let list = split.splitViewItems[0].viewController.view

        #expect(list.frame.width == 340)
        split.splitView.setPosition(200, ofDividerAt: 0)
        split.splitView.layoutSubtreeIfNeeded()
        #expect(list.frame.width == 280)
        split.splitView.setPosition(600, ofDividerAt: 0)
        split.splitView.layoutSubtreeIfNeeded()
        #expect(list.frame.width == 420)
        #expect(split.splitViewItems[1].viewController.view.frame.width == 1000 - 420 - split.splitView.dividerThickness)
    }

    @Test func theDividerIsWhereItWasLeft() throws {
        let defaults = try #require(UserDefaults(suiteName: "CallsSplitTests-\(UUID())"))
        let (first, split) = try show(width: 1000, defaults: defaults)
        split.splitView.setPosition(390, ofDividerAt: 0)
        split.splitView.layoutSubtreeIfNeeded()
        first.close()

        let (again, restored) = try show(width: 1000, defaults: defaults)
        defer { again.close() }

        #expect(restored.splitViewItems[0].viewController.view.frame.width == 390)
        #expect(restored.splitViewItems.map(\.canCollapse) == [false, true])
    }

    @Test func belowSevenHundredTheListFillsTheWindowAndWideningShowsTheCallAgain() throws {
        var widths: [Bool] = []
        let defaults = try #require(UserDefaults(suiteName: "CallsSplitTests-\(UUID())"))
        let split = makeCallsSplit(list: NSView(), detail: NSView(), defaults: defaults) { widths.append($0) }
        let window = NSWindow(contentRect: NSRect(x: -30_000, y: -30_000, width: 1000, height: 560),
                              styleMask: [.titled, .resizable], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        defer { window.close() }
        window.contentViewController = split
        func resize(_ width: CGFloat) {
            window.setContentSize(NSSize(width: width, height: 560))
            split.view.layoutSubtreeIfNeeded()
        }
        let list = split.splitViewItems[0].viewController.view

        resize(1000)
        #expect(widths.isEmpty && list.frame.width == 340)
        resize(699)
        #expect(widths == [true])
        #expect(split.splitViewItems[1].isCollapsed && list.frame.width == 699)
        resize(560)
        #expect(widths == [true] && list.frame.width == 560)
        resize(700)
        #expect(widths == [true, false])
        #expect(!split.splitViewItems[1].isCollapsed && list.frame.width == 340)
    }

    private func show(width: CGFloat, list: NSView = NSView(), detail: NSView = NSView(),
                      defaults: UserDefaults? = nil) throws -> (NSWindow, NSSplitViewController) {
        let defaults = try defaults ?? #require(UserDefaults(suiteName: "CallsSplitTests-\(UUID())"))
        let split = makeCallsSplit(list: list, detail: detail, defaults: defaults)
        let window = NSWindow(contentRect: NSRect(x: -30_000, y: -30_000, width: width, height: 560),
                              styleMask: [.titled, .resizable], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentViewController = split
        window.setContentSize(NSSize(width: width, height: 560))
        split.view.layoutSubtreeIfNeeded()
        return (window, split)
    }
}
