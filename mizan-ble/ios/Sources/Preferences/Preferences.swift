import Foundation

public final class Preferences {
    public enum Value: Equatable, Sendable {
        case number(Double)
        case text(String)
    }

    private let defaults: UserDefaults
    private let suiteName: String

    public init(suiteName: String) {
        defaults = UserDefaults(suiteName: suiteName)!
        self.suiteName = suiteName
    }

    public func value(for key: String) -> Value? {
        // Only what this suite stores counts: a lookup on the instance also
        // returns registered and launch-argument defaults.
        switch defaults.persistentDomain(forName: suiteName)?[key] {
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
