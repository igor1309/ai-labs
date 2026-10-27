import AppKit
import SwiftUI
import Testing
@testable import PanelUI

@MainActor
struct PanelViewRenderTests {

    @Test func bundlesTheDesignFonts() {

        _ = PanelConfig.glassLedger

        #expect(NSFont(name: "IBMPlexMono-Regular", size: 13) != nil)
        #expect(NSFont(name: "IBMPlexMono-SemiBold", size: 13) != nil)
        #expect(NSFont(name: "IBMPlexSans-Regular", size: 13) != nil)
    }

    @Test(arguments: [ColorScheme.light, .dark])
    func rendersEveryPreviewState(scheme: ColorScheme) throws {

        let holds = [PanelState.Held(entryID: 3, text: "Первый фрагмент"), .init(entryID: 4, text: "Second selection")]
        let preparing = (0...holds.count).map { count in
            (name: "preparing-\(count)-holds", state: PanelState(recording: .on(elapsed: "00:00:12"), log: .preparing(holds: Array(holds.prefix(count)))))
        }
        for (name, state) in PanelState.previews + preparing {

            let host = Offscreen.host(PanelPreview(state: state, scheme: scheme), scheme: scheme)
            let image = try #require(Offscreen.snapshot(host), "\(name) did not render")
            #expect(CGFloat(image.pixelsWide) > PanelConfig.glassLedger.panelWidth, "\(name)")

            for entry in state.shownEntries where !entry.settled.isEmpty {
                let text = Offscreen.textView(in: host)?.string ?? ""
                #expect(text.contains(entry.settled), "\(name) does not show «\(entry.settled)»")
            }

            let expectedHolds: [PanelState.Held] = switch state.log {
            case let .preparing(holds): holds
            case let .lines(lines): lines.holds
            case let .liveTextOff(kept): kept?.holds ?? []
            case .empty: []
            }
            let labels = Offscreen.heldText(in: host)
            #expect(labels.map(\.stringValue) == expectedHolds.map { "«\($0.text)»" }, "\(name)")
            #expect(labels.map { $0.accessibilityLabel() } == expectedHolds.map { "«\($0.text)»" }, "\(name)")
            let window = try #require(host.window)
            let visible = window.convertToScreen(host.convert(host.visibleRect, to: nil))
            for label in labels {
                let frame = label.accessibilityFrame()
                #expect(!label.isHiddenOrHasHiddenAncestor)
                #expect(!frame.isEmpty && visible.contains(frame), "\(name) held text is not visible")
            }

            try Offscreen.save(image, "\(name)-\(scheme == .dark ? "dark" : "light")")
        }
    }
}

private extension PanelState {

    var shownEntries: [Entry] {

        switch log {
        case .empty, .preparing, .liveTextOff(kept: nil): []
        case let .liveTextOff(kept: lines?), let .lines(lines): lines.entries
        }
    }
}
