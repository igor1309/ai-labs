import SwiftUI

/// The Mizan sign: an M turned 90° clockwise, with a descending tail and two
/// bars. Its box matches the design's: the head is cap height and the tail
/// drops below the baseline like a descender, so it sits beside an amount's
/// digits without nudging.
public struct MizanSign: Shape {

    /// Width over height of the sign's box.
    public static let aspectRatio = box.width / box.height

    public init() {}

    public func path(in rect: CGRect) -> Path {

        let scale = min(rect.width / Self.box.width, rect.height / Self.box.height)
        let size = CGSize(width: Self.box.width * scale, height: Self.box.height * scale)
        let origin = CGPoint(x: rect.midX - size.width / 2, y: rect.midY - size.height / 2)
        let transform = CGAffineTransform(translationX: origin.x, y: origin.y)
            .scaledBy(x: scale, y: scale)
            .translatedBy(x: -Self.box.minX, y: -Self.box.minY)

        var path = Path()
        for outline in Self.outlines {
            path.addLines(outline.map { CGPoint(x: $0.0, y: $0.1) })
            path.closeSubpath()
        }
        return path.applying(transform)
    }

    /// The design's view box: the glyph sits inside it with room above the
    /// head, as a cap-height glyph does in its line.
    static let box = CGRect(x: -11, y: -39, width: 83, height: 158)

    /// The glyph's outlines in view-box units, all wound the same way.
    static let outlines: [[(CGFloat, CGFloat)]] = [
        [(0, 0), (72, 0), (72, 13), (0, 13)],
        [(0, 67), (72, 67), (72, 80), (0, 80)],
        [(72, 18), (45.6, 40), (72, 62), (72, 80), (24, 40), (72, 0)],
        [(0, 67), (13, 67), (13, 119), (0, 119)],
        [(-11, 92), (24, 92), (24, 99), (-11, 99)],
        [(-11, 104), (24, 104), (24, 111), (-11, 111)],
    ]
}
