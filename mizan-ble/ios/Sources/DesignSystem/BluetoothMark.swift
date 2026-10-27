import SwiftUI

/// The connection mark used by the paired screens, including a lost link.
public struct BluetoothMark: View {
    private let isLost: Bool

    public init(isLost: Bool = false) {
        self.isLost = isLost
    }

    public var body: some View {
        GeometryReader { geometry in
            let width = geometry.size.width
            let height = geometry.size.height
            Path { path in
                path.move(to: CGPoint(x: width * 0.3, y: height * 0.25))
                path.addLine(to: CGPoint(x: width * 0.7, y: height * 0.65))
                path.addLine(to: CGPoint(x: width * 0.5, y: height * 0.85))
                path.addLine(to: CGPoint(x: width * 0.5, y: height * 0.05))
                path.addLine(to: CGPoint(x: width * 0.7, y: height * 0.25))
                path.addLine(to: CGPoint(x: width * 0.3, y: height * 0.65))
                if isLost {
                    path.move(to: CGPoint(x: width * 0.1, y: height * 0.05))
                    path.addLine(to: CGPoint(x: width * 0.9, y: height * 0.85))
                }
            }
            .stroke(style: StrokeStyle(lineWidth: Tokens.space1, lineCap: .round, lineJoin: .round))
        }
        .frame(width: Tokens.space12, height: Tokens.space12)
        .accessibilityHidden(true)
    }
}
