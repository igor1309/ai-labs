import SwiftUI

/// A surrounding mode switch supplies the header's selection and action.
/// Without one, headers use their explicit side and switch closure.
public struct ModeSwitchConfiguration {
    public let side: Side
    public let isEnabled: Bool
    public let onSelect: (Side) -> Void

    public init(side: Side, isEnabled: Bool, onSelect: @escaping (Side) -> Void) {
        self.side = side
        self.isEnabled = isEnabled
        self.onSelect = onSelect
    }
}

public extension EnvironmentValues {
    @Entry var modeSwitch: ModeSwitchConfiguration? = nil
}
