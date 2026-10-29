import DesignSystem
import HostUI
import SwiftUI
import Testing
@testable import Root

@Suite @MainActor struct HostRenderTests {
    @Test(arguments: [ColorScheme.light, .dark], [393.0, 430.0])
    func compactHandshakeKeepsTheCountdownBelowItsCopy(scheme: ColorScheme, width: Double) throws {
        let state = HostMapping.screen(
            amount: typedAmount("124.5"), broadcast: handshake(), payment: nil,
            name: "MIZAN-ABCD", seconds: 60
        )
        #expect(state.buttons.isEmpty)
        let renderer = ImageRenderer(content: HostView(state: state, event: { _ in })
            .environment(\.horizontalSizeClass, .compact)
            .environment(\.colorScheme, scheme)
            .frame(width: width, height: 852))
        renderer.scale = 1
        let image = try #require(renderer.cgImage)
        let pixels = RenderPixels(image)
        let raised = rgba(Tokens.raised, scheme: scheme)

        // Only the connection card paints more than half a row in this surface.
        let panelRows = (0..<image.height).filter { y in
            (0..<image.width).filter { pixels.matches(raised, x: $0, y: y) }.count > image.width / 2
        }
        let panelTop = try #require(panelRows.first)
        let panelBottom = try #require(panelRows.last)
        let title = try #require(pixels.rows(of: rgba(Tokens.text, scheme: scheme), in: panelTop...panelBottom))
        let detail = try #require(pixels.rows(of: rgba(Tokens.text2, scheme: scheme), in: panelTop...panelBottom))
        let countdown = try #require(pixels.rows(of: rgba(Tokens.hostHi, scheme: scheme), in: panelTop...panelBottom))

        #expect(title.upperBound < detail.lowerBound, "handshake title overlaps its detail")
        #expect(detail.upperBound < countdown.lowerBound, "handshake countdown overlaps the title or detail")
    }
}

private struct RenderPixels {
    let width: Int
    let bytes: [UInt8]

    init(_ image: CGImage) {
        width = image.width
        var storage = [UInt8](repeating: 0, count: image.width * image.height * 4)
        let context = CGContext(
            data: &storage, width: image.width, height: image.height,
            bitsPerComponent: 8, bytesPerRow: image.width * 4,
            space: CGColorSpace(name: CGColorSpace.sRGB),
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue)
        )!
        context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
        bytes = storage
    }

    func rows(of color: [Int], in range: ClosedRange<Int>) -> ClosedRange<Int>? {
        let rows = range.filter { y in
            (0..<width).contains { matches(color, x: $0, y: y) }
        }
        guard let first = rows.first, let last = rows.last else { return nil }
        return first...last
    }

    func matches(_ color: [Int], x: Int, y: Int) -> Bool {
        let offset = (y * width + x) * 4
        return (0..<4).allSatisfy { abs(Int(bytes[offset + $0]) - color[$0]) <= 1 }
    }
}

private func rgba(_ color: Color, scheme: ColorScheme) -> [Int] {
    var environment = EnvironmentValues()
    environment.colorScheme = scheme
    let resolved = color.resolve(in: environment)
    return [resolved.red, resolved.green, resolved.blue, resolved.opacity]
        .map { Int(($0 * 255).rounded()) }
}
