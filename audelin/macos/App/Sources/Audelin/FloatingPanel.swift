import AppKit

@MainActor
protocol PanelWindowDriver: AnyObject {

    var title: String { get set }
    var isReleasedWhenClosed: Bool { get set }
    var isFloatingPanel: Bool { get set }
    var hidesOnDeactivate: Bool { get set }
    var becomesKeyOnlyIfNeeded: Bool { get set }
    var level: NSWindow.Level { get set }
    var collectionBehavior: NSWindow.CollectionBehavior { get set }
    var minSize: NSSize { get set }
    var contentView: NSView? { get set }
    var frame: NSRect { get }
    var shouldClose: (() -> Bool)? { get set }
    func setFrameUsingName(_ name: NSWindow.FrameAutosaveName) -> Bool
    @discardableResult func setFrameAutosaveName(_ name: NSWindow.FrameAutosaveName) -> Bool
    func setFrame(_ frame: NSRect, display: Bool)
    func orderFrontRegardless()
    func orderOut(_ sender: Any?)
}

@MainActor
final class FloatingPanel {

    private let makeWindow: (NSRect, NSWindow.StyleMask) -> any PanelWindowDriver
    private let screenFrame: () -> NSRect?
    private var window: (any PanelWindowDriver)?
    private var visible = false

    init(makeWindow: @escaping (NSRect, NSWindow.StyleMask) -> any PanelWindowDriver,
         screenFrame: @escaping () -> NSRect?) {

        self.makeWindow = makeWindow
        self.screenFrame = screenFrame
    }

    func install(content: NSView, onClose: @escaping () -> Void) {

        let panel = makeWindow(
            .init(x: 0, y: 0, width: 360, height: 560),
            [.titled, .closable, .resizable, .nonactivatingPanel]
        )
        panel.title = "Audelin"
        panel.isReleasedWhenClosed = false
        panel.isFloatingPanel = true
        panel.hidesOnDeactivate = false
        panel.becomesKeyOnlyIfNeeded = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .canJoinAllApplications, .fullScreenAuxiliary]
        panel.minSize = .init(width: 300, height: 240)
        panel.contentView = content
        if !panel.setFrameUsingName("TranscriptPanel"), let screen = screenFrame() {
            var frame = panel.frame
            frame.origin = .init(x: screen.maxX - frame.width,
                                 y: screen.maxY - frame.height)
            panel.setFrame(frame, display: false)
        }
        panel.setFrameAutosaveName("TranscriptPanel")
        panel.shouldClose = {
            onClose()
            // Retain one window and its frame for the next recording or menu reopen.
            return false
        }
        window = panel
        setVisible(visible)
    }

    func setVisible(_ visible: Bool) {

        self.visible = visible
        if visible { window?.orderFrontRegardless() }
        else { window?.orderOut(nil) }
    }
}

final class TranscriptPanel: NSPanel, PanelWindowDriver, NSWindowDelegate {

    var shouldClose: (() -> Bool)? {
        didSet { delegate = self }
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool { shouldClose?() ?? false }

    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}
