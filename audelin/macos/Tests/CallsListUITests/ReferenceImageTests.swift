import AppKit
import Foundation
import RenderedText
import Testing

/// The comparison every preview test relies on: a pixel counts as changed only
/// past a tenth of a channel, the image past a fixed number of changed pixels.
struct ReferenceImageTests {

    @Test func countsOnlyPixelsChangedPastATenthOfAChannel() throws {

        let url = try reference { _ in 100 }
        defer { try? FileManager.default.removeItem(at: url) }

        #expect(try ReferenceImage.compare(image { _ in 120 }, with: url) == .matches)
        #expect(try ReferenceImage.compare(image { $0 < 101 ? 130 : 100 }, with: url) == .differs(pixels: 101))
    }

    /// One missing 12 pt line of text, drawn at 2x, fails even on a large image.
    @Test func aMissingLineOfTextDiffers() throws {

        let url = try reference { _ in 255 }
        defer { try? FileManager.default.removeItem(at: url) }
        let line = NSBitmapImageRep(data: try #require(image { _ in 255 }.tiffRepresentation))!
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: line)
        ("Итоги" as NSString).draw(at: NSPoint(x: 20, y: 20), withAttributes: [.font: NSFont.systemFont(ofSize: 24)])
        NSGraphicsContext.restoreGraphicsState()

        #expect(try ReferenceImage.compare(line, with: url) != .matches)
    }

    private func reference(_ level: (Int) -> UInt8) throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("reference-\(UUID().uuidString).png")
        try #require(image(level).representation(using: .png, properties: [:])).write(to: url)
        return url
    }

    /// A 920×420 grey image whose pixel `n`, row by row, has the given level.
    private func image(_ level: (Int) -> UInt8) -> NSBitmapImageRep {

        let width = 920, height = 420
        let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8, samplesPerPixel: 4,
                                   hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: width * 4, bitsPerPixel: 32)!
        let bytes = rep.bitmapData!
        for n in 0..<(width * height) {
            for channel in 0..<3 { bytes[n * 4 + channel] = level(n) }
            bytes[n * 4 + 3] = 255
        }
        return rep
    }
}
