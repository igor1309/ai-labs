import SystemClock
import Preferences
import Settings

public protocol ClockPort: Sendable {
    func now() -> Double
    func countdown(from count: Int, every interval: Duration) -> AsyncStream<Int>
    func ticks(every interval: Duration) -> AsyncStream<Double>
}

extension SystemClock: ClockPort {}

extension Preferences: @retroactive SettingsStore {
    /// The app's settings live in the `mizan-ble` suite. A suite named as
    /// the app's own bundle identifier does not open, so neither app passes
    /// one of its own.
    public static let appSuiteName = "mizan-ble"
    public static func app() -> Preferences { Preferences(suiteName: appSuiteName) }

    public func value(for key: Settings.Key) -> Settings.Value? {
        switch value(for: key.rawValue) {
        case .number(let value): .number(value)
        case .text(let value): .text(value)
        case nil: nil
        }
    }
    public func set(_ value: Settings.Value, for key: Settings.Key) {
        switch value {
        case .number(let value): set(.number(value), for: key.rawValue)
        case .text(let value): set(.text(value), for: key.rawValue)
        }
    }
}
