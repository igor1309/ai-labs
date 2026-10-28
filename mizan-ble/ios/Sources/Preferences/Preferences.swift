import Foundation

public final class Preferences {
    public enum Value: Equatable, Sendable {
        case number(Double)
        case text(String)
    }

    private let defaults: UserDefaults

    public init(suiteName: String) {
        defaults = UserDefaults(suiteName: suiteName)!
    }

    public func value(for key: String) -> Value? {
        switch defaults.object(forKey: key) {
        case let text as String: .text(text)
        case let number as NSNumber: .number(number.doubleValue)
        default: nil
        }
    }

    public func set(_ value: Value, for key: String) {
        switch value {
        case .number(let number): defaults.set(number, forKey: key)
        case .text(let text): defaults.set(text, forKey: key)
        }
    }
}
