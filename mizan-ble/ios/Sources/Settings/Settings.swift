public protocol SettingsStore: AnyObject {
    func value(for key: Settings.Key) -> Settings.Value?
    func set(_ value: Settings.Value, for key: Settings.Key)
}

public struct Settings {
    public enum Key: String, CaseIterable, Sendable {
        case countdown, pickerAlpha, pickerWindowSeconds, pickerWindowReadings
        case pickerFloor, pickerMargin, pickerFade, advertisedName
    }

    public enum Value: Equatable, Sendable {
        case number(Double)
        case text(String)
    }

    public static let countdownChoices = [15, 30, 60, 90, 120]
    public static let pickerAlphaRange = 0.05...1.0
    public static let pickerWindowSecondsRange = 0.5...5.0
    public static let pickerWindowReadingsRange = 1...20
    public static let pickerFloorRange = -100 ... -30
    public static let pickerMarginRange = 0...20
    public static let pickerFadeRange = 0.5...10.0

    private let store: any SettingsStore
    public let advertisedName: String

    public init(store: any SettingsStore, random: () -> UInt16 = { UInt16.random(in: .min ... .max) }) {
        self.store = store
        if case .text(let name) = store.value(for: .advertisedName),
           name.hasPrefix("MIZAN-"), name.count == 10,
           name.dropFirst(6).allSatisfy({ "0123456789ABCDEF".contains($0) }) {
            advertisedName = name
        } else {
            let hex = String(random(), radix: 16, uppercase: true)
            advertisedName = "MIZAN-" + String(repeating: "0", count: 4 - hex.count) + hex
            store.set(.text(advertisedName), for: .advertisedName)
        }
    }

    public var countdown: Int {
        guard case .number(let value) = store.value(for: .countdown),
              let seconds = Int(exactly: value), Self.countdownChoices.contains(seconds)
        else { return 60 }
        return seconds
    }

    public var pickerAlpha: Double {
        number(.pickerAlpha, in: Self.pickerAlphaRange, default: 0.3)
    }

    public var pickerWindowSeconds: Double {
        number(.pickerWindowSeconds, in: Self.pickerWindowSecondsRange, default: 1)
    }

    public var pickerWindowReadings: Int {
        integer(.pickerWindowReadings, in: Self.pickerWindowReadingsRange, default: 5)
    }

    public var pickerFloor: Int {
        integer(.pickerFloor, in: Self.pickerFloorRange, default: -65)
    }

    public var pickerMargin: Int {
        integer(.pickerMargin, in: Self.pickerMarginRange, default: 6)
    }

    public var pickerFade: Double {
        number(.pickerFade, in: Self.pickerFadeRange, default: 2)
    }

    @discardableResult
    public func chooseCountdown(_ seconds: Int) -> Bool {
        guard Self.countdownChoices.contains(seconds) else { return false }
        store.set(.number(Double(seconds)), for: .countdown)
        return true
    }

    private func number(_ key: Key, in range: ClosedRange<Double>, default fallback: Double) -> Double {
        guard case .number(let value) = store.value(for: key), range.contains(value)
        else { return fallback }
        return value
    }

    private func integer(_ key: Key, in range: ClosedRange<Int>, default fallback: Int) -> Int {
        guard case .number(let value) = store.value(for: key),
              let integer = Int(exactly: value), range.contains(integer)
        else { return fallback }
        return integer
    }
}
