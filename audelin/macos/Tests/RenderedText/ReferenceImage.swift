import AppKit
import Foundation

/// Compares a rendered image with a PNG kept beside the tests. With
/// `AUDELIN_RECORD_REFERENCES` set, it writes the image as the new reference
/// instead, to be looked at and committed.
public enum ReferenceImage {

    public enum Outcome: Equatable {
        case matches
        case recorded
        case missing(String)
        case differs(fraction: Double)
    }

    /// Antialiasing differs a little between machines, so a pixel counts as
    /// changed only past a tenth of a channel, and the image as changed only
    /// past one pixel in two hundred.
    public static func compare(_ image: NSBitmapImageRep, with url: URL) throws -> Outcome {

        if ProcessInfo.processInfo.environment["AUDELIN_RECORD_REFERENCES"] != nil {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try image.representation(using: .png, properties: [:])?.write(to: url)
            return .recorded
        }
        guard let data = try? Data(contentsOf: url), let reference = NSBitmapImageRep(data: data) else {
            return .missing(url.lastPathComponent)
        }
        guard reference.pixelsWide == image.pixelsWide, reference.pixelsHigh == image.pixelsHigh else {
            return .differs(fraction: 1)
        }
        guard let actual = rgba(image), let expected = rgba(reference) else { return .differs(fraction: 1) }
        var changed = 0
        for pixel in stride(from: 0, to: actual.count, by: 4) where (0..<3).contains(where: {
            abs(Int(actual[pixel + $0]) - Int(expected[pixel + $0])) > 25
        }) { changed += 1 }
        let fraction = Double(changed) / Double(image.pixelsWide * image.pixelsHigh)
        return fraction <= 0.005 ? .matches : .differs(fraction: fraction)
    }

    /// The image's pixels as sRGB bytes, four to a pixel.
    private static func rgba(_ image: NSBitmapImageRep) -> [UInt8]? {

        guard let cgImage = image.cgImage, let space = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
        var bytes = [UInt8](repeating: 0, count: image.pixelsWide * image.pixelsHigh * 4)
        let drawn = bytes.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(data: buffer.baseAddress, width: image.pixelsWide, height: image.pixelsHigh,
                                          bitsPerComponent: 8, bytesPerRow: image.pixelsWide * 4, space: space,
                                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            context.draw(cgImage, in: CGRect(x: 0, y: 0, width: image.pixelsWide, height: image.pixelsHigh))
            return true
        }
        return drawn ? bytes : nil
    }
}
