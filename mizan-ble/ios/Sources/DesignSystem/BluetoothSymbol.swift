import SwiftUI

/// The Bluetooth rune used by the discovery and lost-link illustrations.
public struct BluetoothSymbol: Shape {
    public var isSlashed: Bool

    public init(isSlashed: Bool = false) {
        self.isSlashed = isSlashed
    }

    public func path(in rect: CGRect) -> Path {
        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: rect.minX + x * rect.width, y: rect.minY + y * rect.height)
        }
        var rune = Path()
        rune.move(to: point(0.25, 0.25))
        rune.addLine(to: point(0.75, 0.75))
        rune.addLine(to: point(0.5, 0.95))
        rune.addLine(to: point(0.5, 0.05))
        rune.addLine(to: point(0.75, 0.25))
        rune.addLine(to: point(0.25, 0.75))
        if isSlashed {
            rune.move(to: point(0.05, 0.05))
            rune.addLine(to: point(0.95, 0.95))
        }
        return rune.strokedPath(StrokeStyle(
            lineWidth: rect.width * 0.09, lineCap: .round, lineJoin: .round
        ))
    }
}
