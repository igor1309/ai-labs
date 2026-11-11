import AppKit
import Foundation
import RenderedText
import Testing

/// The comparison every preview test relies on: a pixel counts as changed only
/// past a tenth of a channel, the image only past one pixel in two hundred.
struct ReferenceImageTests {

    @Test func countsOnlyPixelsChangedPastATenthOfAChannel() throws {

        let url = FileManager.default.temporaryDirectory.appendingPathComponent("reference-\(UUID().uuidString).png")
        defer { try? FileManager.default.removeItem(at: url) }
        try #require(image { _ in 100 }.representation(using: .png, properties: [:])).write(to: url)

        #expect(try ReferenceImage.compare(image { _ in 120 }, with: url) == .matches)
        #expect(try ReferenceImage.compare(image { $0 == 7 ? 130 : 100 }, with: url) == .differs(fraction: 0.01))
    }

    /// A 10×10 grey image whose pixel `n`, row by row, has the given level.
    private func image(_ level: (Int) -> UInt8) -> NSBitmapImageRep {

        let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 10, pixelsHigh: 10, bitsPerSample: 8, samplesPerPixel: 4,
                                   hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 40, bitsPerPixel: 32)!
        let bytes = rep.bitmapData!
        for n in 0..<100 {
            for channel in 0..<3 { bytes[n * 4 + channel] = level(n) }
            bytes[n * 4 + 3] = 255
        }
        return rep
    }
}
