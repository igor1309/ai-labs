import NameCarry
import Testing

@Suite struct NameCarryTests {
    @Test func mutualMajorityCarriesTheName() {
        let old: [NameCarry.OldSpeaker] = [
            .init(name: "Anna", ranges: [time(0, 80)]),
            .init(name: "Boris", ranges: [time(200, 280)]),
        ]
        let new: [NameCarry.NewSpeaker] = [
            .init(id: 7, ranges: [time(24, 94)]),
            .init(id: 3, ranges: [time(224, 294)]),
            .init(id: 9, ranges: [time(400, 410)]),
        ]

        #expect(NameCarry.names(old: old, new: new) == [7: "Anna", 3: "Boris"])
        #expect(NameCarry.names(old: old.reversed(), new: new.reversed()) == [7: "Anna", 3: "Boris"])
    }

    @Test func evenSplitCarriesNothing() {
        let old: [NameCarry.OldSpeaker] = [.init(name: "Anna", ranges: [time(0, 100)])]
        let new: [NameCarry.NewSpeaker] = [
            .init(id: 1, ranges: [time(0, 50)]),
            .init(id: 2, ranges: [time(50, 100)]),
        ]

        #expect(NameCarry.names(old: old, new: new) == [:])
    }

    @Test func unevenSplitCarriesOnlyTheMutualMajority() {
        let old: [NameCarry.OldSpeaker] = [
            .init(name: "Anna", ranges: [time(0, 240)]),
            .init(name: "Boris", ranges: [time(240, 632), time(900, 998)]),
        ]
        let new: [NameCarry.NewSpeaker] = [.init(id: 1, ranges: [time(72, 632)])]

        #expect(NameCarry.names(old: old, new: new) == [1: "Boris"])
    }

    @Test func twoNamesOnOneSpeakerCarryNothing() {
        let old: [NameCarry.OldSpeaker] = [
            .init(name: "Anna", ranges: [time(0, 100)]),
            .init(name: "Boris", ranges: [time(100, 200)]),
        ]
        let new: [NameCarry.NewSpeaker] = [.init(id: 1, ranges: [time(10, 190)])]

        #expect(NameCarry.names(old: old, new: new) == [:])
    }

    @Test func noOldNamesCarryNothing() {
        let new: [NameCarry.NewSpeaker] = [
            .init(id: 1, ranges: [time(0, 10)]),
            .init(id: 2, ranges: [time(10, 20)]),
        ]

        #expect(NameCarry.names(old: [], new: new) == [:])
        #expect(NameCarry.names(old: [
            .init(name: nil, ranges: [time(0, 10)]),
            .init(name: "", ranges: [time(10, 20)]),
        ], new: new) == [:])
    }

    @Test(arguments: [49.0, 50.0, 51.0])
    func bothMajoritiesAreStrict(shared: Double) {
        let old: [NameCarry.OldSpeaker] = [.init(name: "Anna", ranges: [time(0, 100)])]
        let new: [NameCarry.NewSpeaker] = [.init(id: 1, ranges: [time(100 - shared, 100)])]
        let expected = shared > 50 ? [1: "Anna"] : [:]

        #expect(NameCarry.names(old: old, new: new) == expected)
        #expect(NameCarry.names(
            old: [.init(name: "Anna", ranges: [time(100 - shared, 100)])],
            new: [.init(id: 1, ranges: [time(0, 100)])]
        ) == expected)
    }

    @Test func fragmentedTimelinesUseSpokenTimeRatherThanTheirEnvelope() {
        let old: [NameCarry.OldSpeaker] = [
            .init(name: "Anna", ranges: [time(100, 104), time(0, 4), time(200, 202)]),
        ]
        let new: [NameCarry.NewSpeaker] = [
            .init(id: 1, ranges: [time(1, 4), time(100, 104), time(300, 301)]),
            .init(id: 2, ranges: [time(20, 80)]),
        ]

        #expect(NameCarry.names(old: old, new: new) == [1: "Anna"])
    }

    @Test func overlappingRangesCountTimeOnlyOnce() {
        let repeated = [time(0, 4), time(0, 4), time(2, 6), time(6, 10)]

        #expect(NameCarry.names(
            old: [.init(name: "Anna", ranges: repeated)],
            new: [.init(id: 1, ranges: [time(0, 5)])]
        ) == [:])
        #expect(NameCarry.names(
            old: [.init(name: "Anna", ranges: [time(0, 5)])],
            new: [.init(id: 1, ranges: repeated)]
        ) == [:])
        #expect(NameCarry.names(
            old: [.init(name: "Anna", ranges: repeated)],
            new: [.init(id: 1, ranges: repeated.reversed())]
        ) == [1: "Anna"])
    }

    @Test func equalNameTextDoesNotMergeOldSpeakers() {
        #expect(NameCarry.names(old: [
            .init(name: "Anna", ranges: [time(0, 10)]),
            .init(name: "Anna", ranges: [time(10, 20)]),
        ], new: [.init(id: 1, ranges: [time(0, 20)])]) == [:])
    }

    @Test func concurrentAmbiguousSpeakersCarryNothing() {
        #expect(NameCarry.names(old: [
            .init(name: "Anna", ranges: [time(0, 10)]),
            .init(name: "Boris", ranges: [time(0, 10)]),
        ], new: [.init(id: 1, ranges: [time(0, 10)])]) == [:])
        #expect(NameCarry.names(old: [.init(name: "Anna", ranges: [time(0, 10)])], new: [
            .init(id: 1, ranges: [time(0, 10)]),
            .init(id: 2, ranges: [time(0, 10)]),
        ]) == [:])
    }

    @Test func duplicateNewIDsCarryNothing() {
        #expect(NameCarry.names(old: [
            .init(name: "Anna", ranges: [time(0, 10)]),
            .init(name: "Boris", ranges: [time(10, 20)]),
        ], new: [
            .init(id: 1, ranges: [time(0, 10)]),
            .init(id: 1, ranges: [time(10, 20)]),
        ]) == [:])
    }

    @Test(arguments: [
        [], [time(0, 0)], [time(10, 20)], [time(10, 0)],
        [time(0, .infinity)], [time(.nan, 10)],
        [time(-Double.greatestFiniteMagnitude, Double.greatestFiniteMagnitude)],
    ])
    func noSharedOrInvalidTimeCarriesNothing(ranges: [NameCarry.TimeRange]) {
        #expect(NameCarry.names(
            old: [.init(name: "Anna", ranges: ranges)],
            new: [.init(id: 1, ranges: [time(0, 10)])]
        ) == [:])
        #expect(NameCarry.names(
            old: [.init(name: "Anna", ranges: [time(0, 10)])],
            new: [.init(id: 1, ranges: ranges)]
        ) == [:])
        #expect(NameCarry.names(old: [.init(name: "Anna", ranges: ranges)], new: []) == [:])
    }
}

private func time(_ start: Double, _ end: Double) -> NameCarry.TimeRange {
    .init(start: start, end: end)
}
