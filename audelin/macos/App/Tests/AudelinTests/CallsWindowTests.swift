import AppKit
import Testing
@testable import Audelin

@MainActor
struct CallsWindowTests {
    @Test func aSavedFrameIsRestoredInsteadOfCentering() {
        let window = CallsWindowSpy()
        window.savedFrames = ["CallsWindow"]
        _ = CallsWindow(makeWindow: { window }, activate: {})
        #expect(window.restoredNames == ["CallsWindow"])
        #expect(window.centers == 0)
        #expect(window.autosaveNames == ["CallsWindow"])
    }

    @Test func showingAgainUsesTheSameWindowAndRestoresItFromTheDock() {
        let window = CallsWindowSpy()
        var creations = 0, activations = 0
        let calls = CallsWindow(makeWindow: { creations += 1; return window }, activate: { activations += 1 })
        #expect(window.title == "Звонки")
        #expect(!window.isReleasedWhenClosed)
        #expect(window.minSize == NSSize(width: 560, height: 360))
        #expect(window.centers == 1)
        #expect(window.autosaveNames == ["CallsWindow"])
        calls.show()
        window.isMiniaturized = true
        calls.show()
        #expect(creations == 1)
        #expect(activations == 2)
        #expect(window.fronts == 2)
        #expect(window.restores == 1)
    }
}

@MainActor private final class CallsWindowSpy: CallsWindowDriver {
    var title = ""
    var isReleasedWhenClosed = true
    var minSize = NSSize.zero
    var contentView: NSView?
    var isMiniaturized = false
    var centers = 0, fronts = 0, restores = 0
    var savedFrames: Set<String> = [], restoredNames: [String] = [], autosaveNames: [String] = []
    func center() { centers += 1 }
    func setFrameUsingName(_ name: NSWindow.FrameAutosaveName) -> Bool {
        guard savedFrames.contains(name) else { return false }
        restoredNames.append(name); return true
    }
    func setFrameAutosaveName(_ name: NSWindow.FrameAutosaveName) -> Bool { autosaveNames.append(name); return true }
    func deminiaturize(_ sender: Any?) { restores += 1; isMiniaturized = false }
    func makeKeyAndOrderFront(_ sender: Any?) { fronts += 1 }
}
