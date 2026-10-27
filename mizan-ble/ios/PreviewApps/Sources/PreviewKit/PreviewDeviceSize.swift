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
}
