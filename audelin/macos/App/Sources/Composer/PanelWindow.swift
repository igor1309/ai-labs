import AppKit
import PanelUI
import SwiftUI

/// The window the transcript panel lives in; tests stand in their own.
@MainActor
public protocol PanelWindowDriver: AnyObject {

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

/// The transcript panel's one floating window, shared by the app and the rehearsal.
@MainActor
public final class FloatingPanel {

    private let makeWindow: (NSRect, NSWindow.StyleMask) -> any PanelWindowDriver
    private let screenFrame: () -> NSRect?
    private var window: (any PanelWindowDriver)?
    private var visible = false

    public init(makeWindow: @escaping (NSRect, NSWindow.StyleMask) -> any PanelWindowDriver,
         screenFrame: @escaping () -> NSRect?) {

        self.makeWindow = makeWindow
        self.screenFrame = screenFrame
    }

    public func install(content: NSView, onClose: @escaping () -> Void) {

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

    public func setVisible(_ visible: Bool) {

        self.visible = visible
        if visible { window?.orderFrontRegardless() }
        else { window?.orderOut(nil) }
    }
}

public final class TranscriptPanel: NSPanel, PanelWindowDriver, NSWindowDelegate {

    public var shouldClose: (() -> Bool)? {
        didSet { delegate = self }
    }

    public func windowShouldClose(_ sender: NSWindow) -> Bool { shouldClose?() ?? false }

    override public var canBecomeKey: Bool { false }
    override public var canBecomeMain: Bool { false }
}

extension FloatingPanel {

    /// The panel in a `TranscriptPanel` on the main screen.
    public static func onScreen() -> FloatingPanel {

        FloatingPanel(makeWindow: {
            TranscriptPanel(contentRect: $0, styleMask: $1, backing: .buffered, defer: false)
        }, screenFrame: { NSScreen.main?.visibleFrame })
    }

    /// Shows the composition's panel; closing the window tells the composition.
    public func install(_ model: AudelinMenu) {

        install(content: NSHostingView(rootView: PanelContent(model: model)), onClose: { [weak model] in
            model?.panelClosed()
        })
    }
}

@MainActor
public func panelContentBinding(_ model: AudelinMenu) -> (state: PanelState, event: (PanelEvent) -> Task<Void, Never>) {

    (model.panelState, { event in Task { await model.sendPanel(event) } })
}

private struct PanelContent: View {

    let model: AudelinMenu

    var body: some View {

        GeometryReader { geometry in
            let binding = panelContentBinding(model)
            PanelView(state: binding.state, event: { event in
                _ = binding.event(event)
            }, config: config(width: geometry.size.width))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
    }

    private func config(width: CGFloat) -> PanelConfig {

        var config = PanelConfig.glassLedger
        config.panelWidth = width
        return config
    }
}
