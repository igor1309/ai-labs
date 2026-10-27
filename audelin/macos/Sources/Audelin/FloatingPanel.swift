import AppKit
import Compose
import PanelUI
import SwiftUI

@MainActor
final class FloatingPanel: NSObject, NSWindowDelegate {

    private var window: NSPanel?
    private weak var model: AudelinMenu?
    private var visible = false

    func install(_ model: AudelinMenu) {

        self.model = model
        let panel = TranscriptPanel(
            contentRect: .init(x: 0, y: 0, width: 360, height: 560),
            styleMask: [.titled, .closable, .resizable, .nonactivatingPanel],
            backing: .buffered, defer: false
        )
        panel.title = "Audelin"
        panel.isReleasedWhenClosed = false
        panel.isFloatingPanel = true
        panel.hidesOnDeactivate = false
        panel.becomesKeyOnlyIfNeeded = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .canJoinAllApplications, .fullScreenAuxiliary]
        panel.minSize = .init(width: 300, height: 240)
        panel.contentView = NSHostingView(rootView: PanelContent(model: model))
        if !panel.setFrameUsingName("TranscriptPanel"), let screen = NSScreen.main {
            var frame = panel.frame
            frame.origin = .init(x: screen.visibleFrame.maxX - frame.width,
                                 y: screen.visibleFrame.maxY - frame.height)
            panel.setFrame(frame, display: false)
        }
        panel.setFrameAutosaveName("TranscriptPanel")
        panel.delegate = self
        window = panel
        setVisible(visible)
    }

    func setVisible(_ visible: Bool) {

        self.visible = visible
        if visible { window?.orderFrontRegardless() }
        else { window?.orderOut(nil) }
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {

        model?.panelClosed()
        // Retain one window and its frame for the next recording or menu reopen.
        return false
    }
}

private final class TranscriptPanel: NSPanel {

    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

private struct PanelContent: View {

    let model: AudelinMenu

    var body: some View {

        GeometryReader { geometry in
            PanelView(state: model.panelState, event: { event in
                Task { await model.sendPanel(event) }
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
