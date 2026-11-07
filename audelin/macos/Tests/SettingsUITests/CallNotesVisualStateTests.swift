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
        host.layoutSubtreeIfNeeded()
        let invalid = try #require(Offscreen.snapshot(host))
        // A field outline spans hundreds of pixels, unlike a glyph's fringe.
        #expect(pixels(red, in: invalid) > 300)
        draft.runtimes[0].fields[0].isInvalid = false
        state.callNotes = .loaded(draft)
        host.rootView = SettingsPreview(state: state, scheme: scheme)
        host.layoutSubtreeIfNeeded()
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
            host.layoutSubtreeIfNeeded()
            let image = try #require(Offscreen.snapshot(host))
            #expect(pixels(rgb, in: image) > pixels(rgb, in: blank) + 40, "Missing status color for \(tone), \(scheme)")
        }
    }

    private func pixels(_ rgb: UInt32, in image: NSBitmapImageRep) -> Int {
        let expected = [Int((rgb >> 16) & 255), Int((rgb >> 8) & 255), Int(rgb & 255)]
        guard let source = image.cgImage,
              let context = CGContext(data: nil, width: source.width, height: source.height,
                                      bitsPerComponent: 8, bytesPerRow: source.width * 4,
                                      space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue),
              let data = context.data else { return 0 }
        context.draw(source, in: CGRect(x: 0, y: 0, width: source.width, height: source.height))
        let bytes = data.assumingMemoryBound(to: UInt8.self)
        var count = 0
        for offset in stride(from: 0, to: source.width * source.height * 4, by: 4) {
            if (0..<3).allSatisfy({ abs(Int(bytes[offset + $0]) - expected[$0]) < 4 }) { count += 1 }
        }
        return count
    }
}
