import BleedCleanup
import Testing

@Suite struct BleedGateTests {

    private let gate = BleedGate()

    @Test func twoWordsInARowHeardOnTheCallTrackAreLeaked() {

        let call = words((10, "добрый"), (10.4, "день"))
        let mic = words((10.2, "Добрый"), (10.6, "день,"), (20, "привет"))
        #expect(gate.leaked(microphone: mic, call: call) == 2)
    }

    @Test func aSingleMatchedWordIsNotLeaked() {

        let call = words((10, "да"))
        let mic = words((9, "ну"), (10, "да"), (11, "конечно"))
        #expect(gate.leaked(microphone: mic, call: call) == 0)
    }

    @Test func aMicrophoneWordBetweenMatchesBreaksTheRun() {

        let call = words((10, "один"), (12, "три"))
        let mic = words((10, "один"), (11, "два"), (12, "три"))
        #expect(gate.leaked(microphone: mic, call: call) == 0)
    }

    @Test func matchesCountWithinTheWindowAndNotBeyondIt() {

        let call = words((10, "раз"), (10.5, "два"))
        #expect(gate.leaked(microphone: words((12, "раз"), (12.5, "два")), call: call) == 2)
        #expect(gate.leaked(microphone: words((12.01, "раз"), (12.51, "два")), call: call) == 0)
    }

    @Test func caseYoAndPunctuationDoNotMatter() {

        let call = words((1, "Ещё"), (1.3, "раз"))
        #expect(gate.leaked(microphone: words((1, "еще"), (1.3, "РАЗ!")), call: call) == 2)
    }

    @Test func punctuationAloneNeverMatches() {

        let call = words((1, "—"), (1.2, "—"))
        #expect(gate.leaked(microphone: words((1, "—"), (1.2, "—")), call: call) == 0)
    }

    @Test func emptyTracksAreNotGated() {

        #expect(!gate.isGated(microphone: [], call: words((1, "a"), (2, "b")), duration: 60))
        #expect(!gate.isGated(microphone: words((1, "a"), (2, "b")), call: [], duration: 60))
        #expect(!gate.isGated(microphone: [], call: [], duration: 0))
    }

    @Test func gatesAtThreeLeakedWordsAMinute() {

        let call = words((1, "a"), (2, "b"), (3, "c"))
        let mic = words((1, "a"), (2, "b"), (3, "c"))
        #expect(gate.isGated(microphone: mic, call: call, duration: 60))
        #expect(!gate.isGated(microphone: mic, call: call, duration: 60.1))
    }
}

private func words(_ items: (Double, String)...) -> [Word] {

    items.map { Word(start: $0.0, text: $0.1) }
}
