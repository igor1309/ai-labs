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

    /// The search field is a system control that macOS draws itself, so the
    /// reference images hold only on the release that recorded them; hosted
    /// CI runs a different one.
    nonisolated static let searchFieldDiffers = ProcessInfo.processInfo.environment["GITHUB_ACTIONS"] != nil

    @Test(.disabled(if: searchFieldDiffers, "the search field draws differently across macOS releases"),
          arguments: CallsListPreviews.states.map(\.name), [ColorScheme.light, .dark])
    func drawsAsItsReference(name: String, scheme: ColorScheme) throws {
        for language in CallsListLanguage.allCases { try draws(name, scheme, CallsListText(language: language)) }
    }

    private func draws(_ name: String, _ scheme: ColorScheme, _ text: CallsListText) throws {

        GlassLedger.registerFonts()
        let host = Offscreen.host(
            CallsListView(state: CallsListPreviews.state(name, in: text), text: text, event: { _ in })
                .environment(\.colorScheme, scheme).environment(\.controlActiveState, .key),
            size: CGSize(width: 920, height: 420), scheme: scheme
        )
        let image = try #require(Offscreen.snapshot(host))
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("References/\(name)-\(scheme == .dark ? "dark" : "light")\(text.language == .russian ? "" : "-en").png")

        let outcome = try ReferenceImage.compare(image, with: url)
        #expect([.matches, .recorded].contains(outcome))
    }

    /// In an inactive window the selected row turns grey.
    @Test(.disabled(if: searchFieldDiffers, "the search field draws differently across macOS releases"),
          arguments: [ColorScheme.light, .dark])
    func inactiveWindowDrawsTheSelectionGrey(scheme: ColorScheme) throws {

        GlassLedger.registerFonts()
        var state = CallsListPreviews.state("notes")
        state.selectedID = state.rows[0].id
        let host = Offscreen.host(
            CallsListView(state: state, text: .init(language: .russian), event: { _ in })
                .environment(\.colorScheme, scheme).environment(\.controlActiveState, .inactive),
            size: CGSize(width: 920, height: 420), scheme: scheme
        )
        let image = try #require(Offscreen.snapshot(host))
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("References/inactive-\(scheme == .dark ? "dark" : "light").png")

        let outcome = try ReferenceImage.compare(image, with: url)
        #expect([.matches, .recorded].contains(outcome))
    }

    /// At the window's minimum width every column still shows; a long title gives way with an ellipsis.
    @Test(.disabled(if: searchFieldDiffers, "the search field draws differently across macOS releases"),
          arguments: [ColorScheme.light, .dark])
    func minimumWidthKeepsEveryColumn(scheme: ColorScheme) throws {

        GlassLedger.registerFonts()
        let host = Offscreen.host(
            CallsListView(state: CallsListPreviews.state("long-title"), text: .init(language: .russian), event: { _ in })
                .environment(\.colorScheme, scheme).environment(\.controlActiveState, .key),
            size: CGSize(width: 560, height: 420), scheme: scheme
        )
        let image = try #require(Offscreen.snapshot(host))
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("References/minimum-width-\(scheme == .dark ? "dark" : "light").png")

        let outcome = try ReferenceImage.compare(image, with: url)
        #expect([.matches, .recorded].contains(outcome))
    }
}
