import AppKit
import RenderedText
import SwiftUI
import Testing
@testable import SettingsUI

@MainActor
struct CallNotesVisualStateTests {
    @Test(arguments: [ColorScheme.light, .dark])
    func invalidFieldPaintsAnErrorOutlineAndClearingItRestoresTheNeutralOutline(scheme: ColorScheme) throws {
        var state = try #require(SettingsState.summaryPreviews.first?.state)
        guard case var .loaded(draft) = state.callNotes else { Issue.record("Missing draft"); return }
        let host = Offscreen.host(SettingsPreview(state: state, scheme: scheme), scheme: scheme)
        let normal = try #require(Offscreen.snapshot(host))
        let red: UInt32 = scheme == .light ? 0xE5484D : 0xF2555A
        #expect(pixels(red, in: normal) == 0)
        draft.runtimes[0].fields[0].isInvalid = true
        state.callNotes = .loaded(draft)
        host.rootView = SettingsPreview(state: state, scheme: scheme)
        let invalid = try #require(Offscreen.snapshot(host))
        // A field outline spans hundreds of pixels, unlike a glyph's fringe.
        #expect(pixels(red, in: invalid) > 300)
        draft.runtimes[0].fields[0].isInvalid = false
        state.callNotes = .loaded(draft)
        host.rootView = SettingsPreview(state: state, scheme: scheme)
        #expect(pixels(red, in: try #require(Offscreen.snapshot(host))) == 0)
    }

    @Test(arguments: [ColorScheme.light, .dark])
    func statusTonesPaintTheSuppliedTextWithTheirDesignColors(scheme: ColorScheme) throws {
        var state = try #require(SettingsState.summaryPreviews.first?.state)
        guard case var .loaded(draft) = state.callNotes else { Issue.record("Missing draft"); return }
        draft.status = ""
        state.callNotes = .loaded(draft)
        let host = Offscreen.host(SettingsPreview(state: state, scheme: scheme), scheme: scheme)
        let blank = try #require(Offscreen.snapshot(host))
        let colors: [(SettingsState.NotesTone, UInt32)] = scheme == .light
            ? [(.secondary, 0x8A909A), (.success, 0x0E9F92), (.error, 0xE5484D)]
            : [(.secondary, 0x7C828D), (.success, 0x4FD1C5), (.error, 0xF2555A)]
        for (tone, rgb) in colors {
            draft.status = "MMMM STATUS MMMM"
            draft.statusTone = tone
            state.callNotes = .loaded(draft)
            host.rootView = SettingsPreview(state: state, scheme: scheme)
            let image = try #require(Offscreen.snapshot(host))
            #expect(pixels(rgb, in: image) > pixels(rgb, in: blank) + 40, "Missing status color for \(tone), \(scheme)")
        }
    }

    private func pixels(_ rgb: UInt32, in image: NSBitmapImageRep) -> Int {
        let expected = [Double((rgb >> 16) & 255), Double((rgb >> 8) & 255), Double(rgb & 255)]
        var count = 0
        for y in 0..<image.pixelsHigh {
            for x in 0..<image.pixelsWide {
                guard let color = image.colorAt(x: x, y: y)?.usingColorSpace(.sRGB) else { continue }
                let actual = [color.redComponent * 255, color.greenComponent * 255, color.blueComponent * 255]
                if zip(actual, expected).allSatisfy({ abs($0 - $1) < 4 }) { count += 1 }
            }
        }
        return count
    }
}
