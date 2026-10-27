import Settings
import Testing

struct SettingsTests {
    @Test func freshStoreReadsDefaults() {
        let settings = Settings(store: MemoryStore(), random: { 0 })

        #expect(settings.countdown == 60)
        #expect(settings.pickerAlpha == 0.3)
        #expect(settings.pickerWindowSeconds == 1)
        #expect(settings.pickerWindowReadings == 5)
        #expect(settings.pickerFloor == -65)
        #expect(settings.pickerMargin == 6)
        #expect(settings.pickerFade == 2)
    }

    @Test func chosenCountdownSurvivesANewInstance() {
        for seconds in [30, 15, 60, 90, 120] {
            let store = MemoryStore()
            let settings = Settings(store: store, random: { 0 })

            #expect(settings.chooseCountdown(seconds))
            #expect(settings.countdown == seconds)
            #expect(Settings(store: store, random: { 1 }).countdown == seconds)
        }
    }

    @Test func unofferedCountdownIsRefused() {
        for previous in [60, 30] {
            for seconds in [45, 0, -15, 16, 121, Int.min, Int.max] {
                let store = MemoryStore([.countdown: .number(Double(previous))])
                let settings = Settings(store: store, random: { 0 })

                #expect(!settings.chooseCountdown(seconds))
                #expect(settings.countdown == previous)
                #expect(Settings(store: store, random: { 1 }).countdown == previous)
            }
        }
    }

    @Test func invalidStoredNumbersReadDefaults() {
        let cases: [(Settings.Key, KeyPath<Settings, Double>, Double, [Double])] = [
            (.pickerAlpha, \.pickerAlpha, 0.3, [0.049, 1.01]),
            (.pickerWindowSeconds, \.pickerWindowSeconds, 1, [0.49, 5.01]),
            (.pickerFade, \.pickerFade, 2, [0.49, 10.01]),
        ]
        for (key, property, fallback, outside) in cases {
            for value in outside + [.nan, -.infinity, .infinity] {
                let settings = Settings(store: MemoryStore([key: .number(value)]), random: { 0 })
                #expect(settings[keyPath: property] == fallback)
            }
            let settings = Settings(store: MemoryStore([key: .text("bad")]), random: { 0 })
            #expect(settings[keyPath: property] == fallback)
        }
        let integerCases: [(Settings.Key, KeyPath<Settings, Int>, Int, [Double])] = [
            (.countdown, \.countdown, 60, [0, 45, 121, 30.5]),
            (.pickerWindowReadings, \.pickerWindowReadings, 5, [0, 21, 1.5]),
            (.pickerFloor, \.pickerFloor, -65, [0, -101, -29, -65.5]),
            (.pickerMargin, \.pickerMargin, 6, [-1, 21, 6.5]),
        ]
        for (key, property, fallback, outside) in integerCases {
            for value in outside + [.nan, -.infinity, .infinity, Double.greatestFiniteMagnitude] {
                let settings = Settings(store: MemoryStore([key: .number(value)]), random: { 0 })
                #expect(settings[keyPath: property] == fallback)
            }
            let settings = Settings(store: MemoryStore([key: .text("bad")]), random: { 0 })
            #expect(settings[keyPath: property] == fallback)
        }
    }

    @Test func advertisedNameIsGeneratedOnce() {
        for (bits, expected) in [(UInt16(0), "MIZAN-0000"), (0x000A, "MIZAN-000A"),
                                 (0x12AF, "MIZAN-12AF"), (0xFFFF, "MIZAN-FFFF")] {
            let store = MemoryStore()
            var generations = 0
            let first = Settings(store: store, random: { generations += 1; return bits })
            let second = Settings(store: store, random: { generations += 1; return 0xBBBB })

            #expect(first.advertisedName == expected)
            #expect(first.advertisedName == expected)
            #expect(second.advertisedName == expected)
            #expect(generations == 1)
            #expect(store.value(for: .advertisedName) == .text(expected))
        }
    }

    @Test func validStoredPickerValuesAreReadAtEachRead() {
        let store = MemoryStore([.pickerMargin: .number(8)])
        let settings = Settings(store: store, random: { 0 })
        #expect(settings.pickerMargin == 8)

        let realCases: [(Settings.Key, KeyPath<Settings, Double>, [Double])] = [
            (.pickerAlpha, \.pickerAlpha, [0.05, 0.4, 1]),
            (.pickerWindowSeconds, \.pickerWindowSeconds, [0.5, 3, 5]),
            (.pickerFade, \.pickerFade, [0.5, 4, 10]),
        ]
        for (key, property, values) in realCases {
            for value in values {
                store.set(.number(value), for: key)
                #expect(settings[keyPath: property] == value)
            }
        }
        let integerCases: [(Settings.Key, KeyPath<Settings, Int>, [Int])] = [
            (.pickerWindowReadings, \.pickerWindowReadings, [1, 8, 20]),
            (.pickerFloor, \.pickerFloor, [-100, -70, -30]),
            (.pickerMargin, \.pickerMargin, [0, 8, 20]),
        ]
        for (key, property, values) in integerCases {
            for value in values {
                store.set(.number(Double(value)), for: key)
                #expect(settings[keyPath: property] == value)
            }
        }
    }

    @Test func unusableStoredNameGetsAGeneratedName() {
        let values: [Settings.Value] = [
            .number(1234), .text(""), .text("OTHER-1234"), .text("MIZAN-ABC"),
            .text("MIZAN-ABCDE"), .text("MIZAN-abcd"), .text("MIZAN-ABCG"),
            .text("MIZAN-１２３４"),
        ]
        for value in values {
            let store = MemoryStore([.advertisedName: value])
            var generations = 0
            let settings = Settings(store: store, random: { generations += 1; return 0x1234 })
            let next = Settings(store: store, random: { generations += 1; return 0xABCD })

            #expect(settings.advertisedName == "MIZAN-1234")
            #expect(next.advertisedName == "MIZAN-1234")
            #expect(store.value(for: .advertisedName) == .text("MIZAN-1234"))
            #expect(generations == 1)
        }
    }

    @Test func offeredChoicesAndRangesMatchTheContract() {
        #expect(Settings.countdownChoices == [15, 30, 60, 90, 120])
        #expect(Settings.pickerAlphaRange == 0.05...1)
        #expect(Settings.pickerWindowSecondsRange == 0.5...5)
        #expect(Settings.pickerWindowReadingsRange == 1...20)
        #expect(Settings.pickerFloorRange == -100 ... -30)
        #expect(Settings.pickerMarginRange == 0...20)
        #expect(Settings.pickerFadeRange == 0.5...10)
    }
}

private final class MemoryStore: SettingsStore {
    private var values: [Settings.Key: Settings.Value]

    init(_ values: [Settings.Key: Settings.Value] = [:]) { self.values = values }

    func value(for key: Settings.Key) -> Settings.Value? { values[key] }
    func set(_ value: Settings.Value, for key: Settings.Key) { values[key] = value }
}
