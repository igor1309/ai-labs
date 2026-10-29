import DesignSystem

/// The root supplies the chosen mode and whether the live flow allows a switch.
public struct ModeSwitchState: Equatable, Sendable {

    public var side: Side
    public var isEnabled: Bool
    public var sideProjection: Side { side }

    public init(side: Side, isEnabled: Bool) {
        self.side = side
        self.isEnabled = isEnabled
    }
}
