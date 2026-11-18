import Foundation
import RenderedText
import SwiftUI
import Testing
@testable import SettingsUI

/// Call notes states drawn as intended, compared with their reference images
/// in `References`, in light and dark: the neutral and the invalid field
/// outline, and the status line in its secondary, success and error tones.
@MainActor
struct CallNotesPreviewTests {

    @Test(arguments: ["summaries-on", "summaries-invalid", "summaries-saved", "summaries-save-failed"],
          [ColorScheme.light, .dark])
    func drawsAsItsReference(name: String, scheme: ColorScheme) throws {

        let state = try #require(SettingsState.summaryPreviews.first { $0.name == name }?.state)
        let host = Offscreen.host(SettingsPreview(state: state, scheme: scheme), scheme: scheme)
        let image = try #require(Offscreen.snapshot(host))
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("References/\(name)-\(scheme == .dark ? "dark" : "light").png")

        let outcome = try ReferenceImage.compare(image, with: url)
        #expect([.matches, .recorded].contains(outcome))
    }
}
