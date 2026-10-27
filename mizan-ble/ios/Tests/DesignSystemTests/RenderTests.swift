import CoreGraphics
import Foundation
import ImageIO
import SwiftUI
import Testing
import UniformTypeIdentifiers
@testable import DesignSystem

@MainActor
struct RenderTests {

    /// Points in the sign's view box: the first ones lie on its strokes, the
    /// rest in the gaps between them.
    @Test func drawsTheSignsStrokesAndLeavesItsGaps() throws {

        let image = try #require(render(MizanSign().fill(.white).frame(width: 83, height: 158), scale: 1))

        for point in [(36, 6), (50, 25), (6, 100), (-5, 95), (-5, 107)] {
            #expect(alpha(image, at: point) > 0.9, "no ink at \(point)")
        }
        for point in [(20, 25), (20, 50), (40, 100), (-5, 101), (6, -20)] {
            #expect(alpha(image, at: point) < 0.1, "ink at \(point)")
        }
    }

    @Test func emptiesTheRingAsTimeRunsOut() {

        #expect(CountdownRing(secondsLeft: 47, total: 60).fraction == 47.0 / 60)
        #expect(CountdownRing(secondsLeft: 0, total: 60).fraction == 0)
        #expect(CountdownRing(secondsLeft: 90, total: 60).fraction == 1)
        #expect(CountdownRing(secondsLeft: 5, total: 0).fraction == 0)
    }

    @Test(arguments: [ColorScheme.light, .dark])
    func rendersEveryComponent(scheme: ColorScheme) throws {

        for (name, view) in components {
            let image = try #require(render(view.environment(\.colorScheme, scheme)), "\(name) did not render")
            #expect(image.width > 0 && image.height > 0, "\(name)")
            #expect(hasInk(image), "\(name) drew nothing")
        }

        let gallery = try #require(render(DesignSystemGallery().environment(\.colorScheme, scheme)))
        try save(gallery, "gallery-\(scheme == .dark ? "dark" : "light")")
    }

    private var components: [(String, AnyView)] {

        var views: [(String, AnyView)] = []
        for kind in ActionButtonStyle.Kind.allCases {
            let button = Button {} label: { Label("Label", systemImage: "lock") }
                .buttonStyle(.action(kind))
                .frame(width: 300)
            views.append(("button \(kind)", AnyView(button)))
        }
        for size in AmountView.Size.allCases {
            views.append(("amount \(size)", AnyView(AmountView("124.50", size: size))))
        }
        for side in Side.allCases {
            views.append(("countdown \(side)", AnyView(CountdownRing(secondsLeft: 47, total: 60, side: side))))
            views.append(("rail header \(side)", AnyView(ModeHeader(side: side, layout: .rail) { _ in })))
            views.append(("bar header \(side)", AnyView(ModeHeader(side: side, layout: .bar) { _ in }.frame(width: 353))))
        }
        for outcome in Outcome.allCases {
            views.append(("result card \(outcome)", AnyView(ResultCard(outcome, title: "Title").frame(width: 320))))
        }
        return views
    }
}

@MainActor
private func render(_ view: some View, scale: CGFloat = 2) -> CGImage? {

    let renderer = ImageRenderer(content: view)
    renderer.scale = scale
    return renderer.cgImage
}

/// The image in premultiplied RGBA bytes, top row first.
private func pixels(_ image: CGImage) -> [UInt8] {

    var bytes = [UInt8](repeating: 0, count: image.width * image.height * 4)
    let context = CGContext(
        data: &bytes,
        width: image.width,
        height: image.height,
        bitsPerComponent: 8,
        bytesPerRow: image.width * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )
    context?.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
    return bytes
}

/// The opacity at a point in the sign's view box, for an image of the box
/// drawn at one pixel per unit.
private func alpha(_ image: CGImage, at point: (Int, Int)) -> Double {

    let x = point.0 - Int(MizanSign.box.minX)
    let y = point.1 - Int(MizanSign.box.minY)
    return Double(pixels(image)[(y * image.width + x) * 4 + 3]) / 255
}

private func hasInk(_ image: CGImage) -> Bool {

    let bytes = pixels(image)
    return stride(from: 3, to: bytes.count, by: 4).contains { bytes[$0] > 0 }
}

/// Writes the image only when `MIZAN_SNAPSHOTS` names a folder, for comparing
/// the components with the design by eye.
private func save(_ image: CGImage, _ name: String) throws {

    guard let folder = ProcessInfo.processInfo.environment["MIZAN_SNAPSHOTS"] else { return }

    let url = URL(fileURLWithPath: folder).appendingPathComponent("\(name).png") as CFURL
    let destination = try #require(CGImageDestinationCreateWithURL(url, UTType.png.identifier as CFString, 1, nil))
    CGImageDestinationAddImage(destination, image, nil)
    #expect(CGImageDestinationFinalize(destination))
}
