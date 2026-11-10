import CallsListUI
import Foundation
import GlassLedger
import RenderedText
import SwiftUI
import Testing

/// Each named list state drawn as intended, compared with its reference
/// image in `References`, in light and dark.
@MainActor
struct CallsListPreviewTests {

    @Test(arguments: CallsListPreviews.states.map(\.name), [ColorScheme.light, .dark])
    func drawsAsItsReference(name: String, scheme: ColorScheme) throws {

        GlassLedger.registerFonts()
        let host = Offscreen.host(
            CallsListView(state: CallsListPreviews.state(name), event: { _ in }).environment(\.colorScheme, scheme),
            size: CGSize(width: 920, height: 420), scheme: scheme
        )
        let image = try #require(Offscreen.snapshot(host))
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("References/\(name)-\(scheme == .dark ? "dark" : "light").png")

        let outcome = try ReferenceImage.compare(image, with: url)
        #expect(outcome == .matches || outcome == .recorded)
    }
}
