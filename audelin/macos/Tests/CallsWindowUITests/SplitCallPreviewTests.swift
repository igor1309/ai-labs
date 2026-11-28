import AppKit
import CallsWindowUI
import GlassLedger
import RenderedText
import SummaryPreviewUI
import SwiftUI
import Testing

@MainActor
struct SplitCallPreviewTests {
    // Native buttons and text fields are drawn by the installed macOS release.
    nonisolated static let systemControlsDiffer = ProcessInfo.processInfo.environment["GITHUB_ACTIONS"] != nil

    @Test(.disabled(if: systemControlsDiffer, "native controls draw differently across macOS releases"),
          arguments: SplitCallPreviews.allCases, [ColorScheme.light, .dark])
    func drawsTheSplitFrame(frame: SplitCallPreviews, scheme: ColorScheme) throws {
        GlassLedger.registerFonts()
        let host = Offscreen.host(frame.view().environment(\.colorScheme, scheme)
            .environment(\.controlActiveState, .key), scheme: scheme)
        defer { host.window?.isReleasedWhenClosed = false; host.window?.close() }
        let image = try #require(Offscreen.snapshot(host))
        #expect(image.pixelsWide == Int(frame.width * 2))
        let name = "split-\(frame.rawValue)-\(scheme == .light ? "light" : "dark")"
        let reference = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("References/\(name).png")
        let outcome = try ReferenceImage.compare(image, with: reference)
        #expect([.matches, .recorded].contains(outcome), "\(name): \(outcome)")
    }
}
