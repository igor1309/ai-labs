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
        // A plain loop over the raw bytes: tests run unoptimised, and a closure per pixel costs most of a second an image.
        let changed = actual.withUnsafeBufferPointer { a in
            expected.withUnsafeBufferPointer { e in
                var count = 0, pixel = 0
                while pixel < a.count {
                    let red = Int(a[pixel]) - Int(e[pixel]), green = Int(a[pixel + 1]) - Int(e[pixel + 1]), blue = Int(a[pixel + 2]) - Int(e[pixel + 2])
                    if red > 25 || red < -25 || green > 25 || green < -25 || blue > 25 || blue < -25 { count += 1 }
                    pixel += 4
                }
                return count
            }
        }
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
