import SwiftUI

/// The two modes the app runs in. Each has its own colour: the host orange,
/// the client cyan.
public enum Side: CaseIterable, Sendable {

    case host
    case client

    public var accent: Color {

        switch self {
        case .host: Tokens.host
        case .client: Tokens.client
        }
    }

    public var accentHi: Color {

        switch self {
        case .host: Tokens.hostHi
        case .client: Tokens.clientHi
        }
    }

    public var tint: Color {

        switch self {
        case .host: Tokens.hostTint
        case .client: Tokens.clientTint
        }
    }

    var title: String {

        switch self {
        case .host: "Host"
        case .client: "Client"
        }
    }

    var symbol: String {

        switch self {
        case .host: "ipad"
        case .client: "iphone"
        }
    }
}
