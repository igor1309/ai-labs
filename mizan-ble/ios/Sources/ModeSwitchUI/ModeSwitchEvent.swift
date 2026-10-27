import DesignSystem

public enum ModeSwitchEvent: Equatable, Sendable {
    case choose(Side)
}
