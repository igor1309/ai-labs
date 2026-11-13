import AppKit
import Testing
@testable import CallsWindowShell

@MainActor
struct CallsWindowTests {
    @Test func aSavedFrameIsRestoredAfterTheContentIsInstalled() {
        let window = CallsWindowSpy()
        window.savedFrames = ["CallsWindow"]
        let calls = CallsWindow(makeWindow: { window }, title: "Звонки", activate: {})
        #expect(window.steps.isEmpty)
        let controller = NSViewController()
        calls.install(controller: controller)
        #expect(window.contentViewController === controller)
        #expect(window.steps == ["content", "restore CallsWindow", "autosave CallsWindow"])
    }

    @Test func aFirstLaunchOpensWideAndCentredAfterTheContentIsInstalled() {
        let window = CallsWindowSpy()
        let calls = CallsWindow(makeWindow: { window }, title: "Звонки", activate: {})
        calls.install(controller: NSViewController())
        #expect(window.steps == ["content", "size 1000x560", "center", "autosave CallsWindow"])
    }

    @Test func showingAgainUsesTheSameWindowAndRestoresItFromTheDock() {
        let window = CallsWindowSpy()
        var creations = 0, activations = 0
        let calls = CallsWindow(makeWindow: { creations += 1; return window }, title: "Звонки", activate: { activations += 1 })
        #expect(window.title == "Звонки")
        #expect(!window.isReleasedWhenClosed)
        #expect(window.minSize == NSSize(width: 560, height: 360))
        calls.show()
        window.isMiniaturized = true
        calls.show()
        #expect(creations == 1)
        #expect(activations == 2)
        #expect(window.fronts == 2)
        #expect(window.restores == 1)
    }
}

@MainActor @Suite struct PresentCallTests {
    @Test func aMinimizedCallWindowIsRestoredAndBroughtToFront() {
        let window = CallsWindowSpy()
        window.isMiniaturized = true
        var shown = 0

        presentCall(window, shown: { _ in shown += 1 })
        presentCall(window, shown: { _ in shown += 1 })

        #expect(window.restores == 1 && window.fronts == 2 && shown == 2)
    }
}

@MainActor private final class CallsWindowSpy: CallsWindowDriver {
    var title = ""
    var isReleasedWhenClosed = true
    var minSize = NSSize.zero
    var contentViewController: NSViewController? { didSet { steps.append("content") } }
    var isMiniaturized = false
    var fronts = 0, restores = 0
    var savedFrames: Set<String> = [], steps: [String] = []
    func center() { steps.append("center") }
    func setContentSize(_ size: NSSize) { steps.append("size \(Int(size.width))x\(Int(size.height))") }
    func setFrameUsingName(_ name: NSWindow.FrameAutosaveName) -> Bool {
        guard savedFrames.contains(name) else { return false }
        steps.append("restore \(name)"); return true
    }
    func setFrameAutosaveName(_ name: NSWindow.FrameAutosaveName) -> Bool { steps.append("autosave \(name)"); return true }
    func deminiaturize(_ sender: Any?) { restores += 1; isMiniaturized = false }
    func makeKeyAndOrderFront(_ sender: Any?) { fronts += 1 }
}
