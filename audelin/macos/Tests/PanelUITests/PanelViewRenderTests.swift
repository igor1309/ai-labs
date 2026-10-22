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

        for (name, state) in PanelState.previews {

            let host = Offscreen.host(PanelPreview(state: state, scheme: scheme), scheme: scheme)
            let image = try #require(Offscreen.snapshot(host), "\(name) did not render")
            #expect(CGFloat(image.pixelsWide) > PanelConfig.glassLedger.panelWidth, "\(name)")

            for entry in state.shownEntries where !entry.settled.isEmpty {
                let text = Offscreen.textView(in: host)?.string ?? ""
                #expect(text.contains(entry.settled), "\(name) does not show «\(entry.settled)»")
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
