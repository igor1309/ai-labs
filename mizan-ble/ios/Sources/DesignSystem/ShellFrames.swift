import SwiftUI

/// The parts of a shell whose place every screen shares.
public enum ShellPart: Hashable, Sendable {
    case header
    case eyebrow
    case actions
}

public extension EnvironmentValues {
    /// Told where a shell drew each shared part, in global coordinates, so a
    /// test can prove that every screen keeps them in one place. Screens
    /// leave it empty.
    @Entry var shellFrames: ((ShellPart, CGRect) -> Void)? = nil
}

extension View {
    func shellFrame(_ part: ShellPart) -> some View {
        modifier(ShellFrameReader(part: part))
    }
}

private struct ShellFrameReader: ViewModifier {
    let part: ShellPart
    @Environment(\.shellFrames) private var report

    func body(content: Content) -> some View {
        content.onGeometryChange(for: CGRect.self, of: { $0.frame(in: .global) }) { report?(part, $0) }
    }
}
