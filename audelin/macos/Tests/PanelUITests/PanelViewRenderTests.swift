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

            let image = try #require(render(state, scheme), "\(name) did not render")
            #expect(image.size.width > PanelConfig.glassLedger.panelWidth, "\(name)")
            #expect(image.size.height > 0, "\(name)")

            try save(image, "\(name)-\(scheme == .dark ? "dark" : "light")")
        }
    }

    // MARK: - Helpers

    private func render(_ state: PanelState, _ scheme: ColorScheme) -> NSImage? {

        let renderer = ImageRenderer(content: PanelPreview(state: state, scheme: scheme))
        renderer.scale = 2
        return renderer.nsImage
    }

    /// Writes the image only when `AUDELIN_SNAPSHOTS` names a folder, for
    /// comparing the panel with the design by eye.
    private func save(_ image: NSImage, _ name: String) throws {

        guard let folder = ProcessInfo.processInfo.environment["AUDELIN_SNAPSHOTS"]
        else { return }

        let png = try #require(
            image.tiffRepresentation
                .flatMap(NSBitmapImageRep.init(data:))?
                .representation(using: .png, properties: [:])
        )
        try png.write(to: URL(fileURLWithPath: folder).appendingPathComponent("\(name).png"))
    }
}
