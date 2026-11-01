import AppKit
@testable import Audelin
@testable import Compose
import PanelUI
import Preferences
import Recording
import Testing

@MainActor
struct FloatingPanelTests {

    @Test func windowDriverCarriesConfigurationVisibilityCloseAndFrames() async throws {

        let recording = AsyncStream<RecordingState>.makeStream()
        let failures = AsyncStream<any Error>.makeStream()
        let states = AsyncStream<PanelState>.makeStream()
        var events: [PanelEvent] = []
        let model = await AudelinMenu(storage: WindowPreferences(), makeApplication: {
            MenuApplication(states: { recording.stream }, failures: failures.stream,
                send: { _ in Issue.record("Content binding does not send recording events") },
                quit: { Issue.record("Content binding does not quit") },
                panelStates: { states.stream }, sendPanel: { events.append($0) })
        }, openFolder: { _ in Issue.record("Content binding does not open folders") },
            openURL: { _ in Issue.record("Content binding does not open URLs") },
            terminate: { Issue.record("Content binding does not terminate") }, didDeliver: {},
            sink: WindowLogSpy(), presentPanel: { _ in Issue.record("Content binding does not change visibility") },
            sleep: { _ in Issue.record("Content binding does not start a hide delay") })
        let initial = panelContentBinding(model)
        #expect(initial.state == PanelState(recording: .off, log: .empty))
        let state = PanelState(recording: .on(elapsed: "00:02"), log: .liveTextOff(kept: nil))
        states.continuation.yield(state)
        recording.continuation.finish()
        failures.continuation.finish()
        states.continuation.finish()
        await model.waitForObservers()
        let updated = panelContentBinding(model)
        #expect(updated.state == state)
        #expect(initial.state == PanelState(recording: .off, log: .empty))
        await updated.event(.jumpToLive).value
        #expect(events == [.jumpToLive])

        let screen = NSRect(x: -1440, y: 24, width: 1440, height: 876)
        let initialFrame = NSRect(x: 0, y: 0, width: 360, height: 588)
        let restoredFrame = NSRect(x: -1100, y: 180, width: 480, height: 640)
        let defaultFrame = NSRect(x: -360, y: 312, width: 360, height: 588)
        for (screen, restored, expectedFrame, placed): (NSRect?, NSRect?, NSRect, Bool) in [
            (screen, nil, defaultFrame, true),
            (screen, restoredFrame, restoredFrame, false),
            (nil, nil, initialFrame, false),
        ] {
            for initiallyVisible in [false, true] {
                let window = WindowSpy(frame: initialFrame, restoredFrame: restored)
                var creations = 0, screenReads = 0
                let panel = FloatingPanel(makeWindow: { rect, style in
                    creations += 1
                    #expect(rect == NSRect(x: 0, y: 0, width: 360, height: 560))
                    #expect(style == [.titled, .closable, .resizable, .nonactivatingPanel])
                    return window
                }, screenFrame: { screenReads += 1; return screen })
                let content = NSView()
                var closes = 0
                panel.setVisible(initiallyVisible)
                #expect(window.visibility.isEmpty)
                panel.install(content: content, onClose: { [weak panel] in
                    closes += 1
                    panel?.setVisible(false)
                })

                #expect(window.title == "Audelin")
                #expect(!window.isReleasedWhenClosed)
                #expect(window.isFloatingPanel)
                #expect(!window.hidesOnDeactivate)
                #expect(window.becomesKeyOnlyIfNeeded)
                #expect(window.level == .floating)
                #expect(window.collectionBehavior == [.canJoinAllSpaces, .canJoinAllApplications, .fullScreenAuxiliary])
                #expect(window.minSize == NSSize(width: 300, height: 240))
                #expect(window.contentView === content)
                #expect(window.restoreNames == ["TranscriptPanel"])
                #expect(window.autosaveNames == ["TranscriptPanel"])
                #expect(window.frame == expectedFrame)
                #expect(window.setFrames == (placed ? [expectedFrame] : []))
                #expect(window.displays == (placed ? [false] : []))
                #expect(screenReads == (restored == nil ? 1 : 0))
                #expect(window.visibility == [initiallyVisible])

                panel.setVisible(false)
                panel.setVisible(true)
                #expect(window.visibility == [initiallyVisible, false, true])
                let close = try #require(window.shouldClose)
                #expect(closes == 0)
                #expect(close() == false)
                #expect(closes == 1)
                #expect(window.visibility == [initiallyVisible, false, true, false])
                panel.setVisible(true)
                #expect(window.visibility == [initiallyVisible, false, true, false, true])
                #expect(creations == 1)
                #expect(window.frame == expectedFrame)
                #expect(window.setFrames == (placed ? [expectedFrame] : []))
            }
        }
    }
}

@MainActor
private final class WindowSpy: PanelWindowDriver {

    var title = ""
    var isReleasedWhenClosed = true
    var isFloatingPanel = false
    var hidesOnDeactivate = true
    var becomesKeyOnlyIfNeeded = false
    var level = NSWindow.Level.normal
    var collectionBehavior: NSWindow.CollectionBehavior = []
    var minSize = NSSize.zero
    var contentView: NSView?
    var shouldClose: (() -> Bool)?
    private(set) var frame: NSRect
    private let restoredFrame: NSRect?
    private(set) var restoreNames: [String] = []
    private(set) var autosaveNames: [String] = []
    private(set) var setFrames: [NSRect] = []
    private(set) var displays: [Bool] = []
    private(set) var visibility: [Bool] = []

    init(frame: NSRect, restoredFrame: NSRect?) {
        self.frame = frame
        self.restoredFrame = restoredFrame
    }

    func setFrameUsingName(_ name: String) -> Bool {
        restoreNames.append(name)
        guard let restoredFrame else { return false }
        frame = restoredFrame
        return true
    }

    func setFrameAutosaveName(_ name: String) -> Bool {
        autosaveNames.append(name)
        return true
    }

    func setFrame(_ frame: NSRect, display: Bool) {
        setFrames.append(frame)
        displays.append(display)
        self.frame = frame
    }

    func orderFrontRegardless() { visibility.append(true) }
    func orderOut(_ sender: Any?) { visibility.append(false) }
}

private struct WindowPreferences: PreferenceSettingsStorage {
    func read() -> Preferences { .init() }
    func write(_ preferences: Preferences) throws { Issue.record("Window actions do not write preferences") }
}

private struct WindowLogSpy: LogSink {
    func write(_ entry: LogEntry) {}
}
