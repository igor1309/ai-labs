import DesignSystem

public enum HostEvent: Equatable, Sendable {
    case digit(Int), decimalPoint, delete
    case lockAndBroadcast, cancel, broadcastAgain, newAmount, success, failure
    case openSettings
}

/// The same value supplies the button and its event, including disabled controls.
public struct HostAction: Equatable, Sendable {
    public var title: String
    public var event: HostEvent
    public var symbol: String
    public var kind: ActionButtonStyle.Kind
    public var isEnabled: Bool

    public init(
        _ title: String, _ event: HostEvent, symbol: String = "",
        kind: ActionButtonStyle.Kind = .secondary, isEnabled: Bool = true
    ) {
        self.title = title
        self.event = event
        self.symbol = symbol
        self.kind = kind
        self.isEnabled = isEnabled
    }
}

extension HostAction: Identifiable {
    public var id: String { "\(title)-\(String(describing: event))" }
}
