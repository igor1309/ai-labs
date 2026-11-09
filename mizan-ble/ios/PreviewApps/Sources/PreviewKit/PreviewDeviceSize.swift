import DesignSystem
import SwiftUI

public enum PreviewDeviceSize: String, CaseIterable, Sendable {
    case iPad
    case iPhone

    public var size: CGSize {
        switch self {
        case .iPad: CGSize(width: 1194, height: 834)
        case .iPhone: CGSize(width: 393, height: 852)
        }
    }

    /// The status bar and home indicator the design frames draw.
    public var safeArea: EdgeInsets {
        switch self {
        case .iPad: .iPadScreen
        case .iPhone: .iPhoneScreen
        }
    }

    /// The corner radius of the screen the design frames draw.
    public var cornerRadius: CGFloat {
        switch self {
        case .iPad: Tokens.radiusIpad
        case .iPhone: Tokens.radiusIphone
        }
    }
}
