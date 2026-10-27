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
    public static let pickerFloorRange = -100.0 ... -30.0
    public static let pickerMarginRange = 0.0...20.0
    public static let pickerFadeRange = 0.5...10.0

    private let store: any SettingsStore
    public let advertisedName: String

    public init(store: any SettingsStore, random: () -> UInt16 = { UInt16.random(in: .min ... .max) }) {
        self.store = store
        if case .text(let name) = store.value(for: .advertisedName), Self.isAdvertisedName(name) {
            advertisedName = name
        } else {
            advertisedName = Self.makeAdvertisedName(random())
            store.set(.text(advertisedName), for: .advertisedName)
        }
    }

    private static let namePrefix = "MIZAN-"
    private static let nameDigits = 4

    private static func isAdvertisedName(_ name: String) -> Bool {
        guard name.hasPrefix(namePrefix) else { return false }
        let digits = name.dropFirst(namePrefix.count)
        return digits.count == nameDigits && digits.allSatisfy { "0123456789ABCDEF".contains($0) }
    }

    private static func makeAdvertisedName(_ number: UInt16) -> String {
        let hex = String(number, radix: 16, uppercase: true)
        return namePrefix + String(repeating: "0", count: nameDigits - hex.count) + hex
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

    public var pickerFloor: Double {
        number(.pickerFloor, in: Self.pickerFloorRange, default: -65)
    }

    public var pickerMargin: Double {
        number(.pickerMargin, in: Self.pickerMarginRange, default: 6)
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
