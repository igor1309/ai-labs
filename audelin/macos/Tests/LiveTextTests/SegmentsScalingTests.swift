import Testing
@testable import LiveText

/// A three-hour call is about 27,000 words a side. Each hearing should cost
/// about the same an hour in as a minute in, so the text keeps up with the
/// audio however long the call runs.
struct SegmentsScalingTests {

    @Test func aHearingLateInALongCallCostsAboutWhatAnEarlyOneDoes() {

        // Early and late take turns in short chunks, and each side's cost is
        // its quickest chunk. A busy runner slows some chunks for whole
        // stretches; a chunk this short almost always finds a quiet slice,
        // and both sides get the same chances at one. Work that does not
        // grow with the call stays well within 3x: caches cold for a longer
        // call cost a little.
        var early = Call(history: 300), late = Call(history: 30_000)
        var earlySeconds = Double.infinity, lateSeconds = Double.infinity
        for _ in 0..<40 {
            earlySeconds = min(earlySeconds, early.secondsPerHearing(hearings: 50))
            lateSeconds = min(lateSeconds, late.secondsPerHearing(hearings: 50))
        }
        #expect(early.lost == 0, "\(early.lost) words lost after 300")
        #expect(late.lost == 0, "\(late.lost) words lost after 30,000")
        #expect(lateSeconds / earlySeconds <= 3, "a hearing after 30,000 words costs \(lateSeconds / earlySeconds)x one after 300")
    }

    /// Segments already final are not cut again, so cutting words as they
    /// arrive must end where cutting them all at once does: through pauses,
    /// sentence ends and monologues long enough to cut by length.
    @Test func cuttingWordsAsTheyArriveEndsAsCuttingThemAllAtOnce() {

        var words: [Word] = []
        var time = 0.0
        for index in 0..<3_000 {
            let monologue = (index / 200) % 2 == 1
            let gap = !monologue && index % 23 == 0 ? 1.5 : 0.1
            time += gap
            let text = index % 11 == 0 ? "w\(index)." : "w\(index)"
            words.append(Word(text, start: time, end: time + 0.3))
            time += 0.3
        }

        var arriving = Segments(pause: 1)
        for index in words.indices {
            // A word is a draft for two hearings, read right in the third,
            // and final a word after that.
            let first = max(0, index - 2)
            let heard = words[first...index].enumerated().map { offset, word in
                first + offset < index - 1 ? word : Word("~" + word.text, start: word.start, end: word.end)
            }
            arriving.hear(Hearing(words: heard, from: heard[0].start, finalThrough: index >= 3 ? words[index - 3].end : nil))
        }
        arriving.finish(Hearing(words: Array(words.suffix(2)), from: words[words.count - 2].start))
        var atOnce = Segments(pause: 1)
        atOnce.finish(Hearing(words: words))

        #expect(arriving.all == atOnce.all)
        #expect(arriving.all.count > 100, "only \(arriving.all.count) segments")
    }
}

/// A call `history` words in: a word every 0.4 s in 8 s sentences with
/// 4 s pauses, final a second after it ends.
private struct Call {

    private var segments = Segments(pause: 1)
    private var spoken = Speaker()

    init(history: Int) {

        // The history arrives in one hearing, so building it stays cheap.
        let past = (0..<history).flatMap { _ in spoken.next().words.suffix(1) }
        segments.hear(Hearing(words: past, finalThrough: past.last.map { $0.end }))
    }

    /// Times `hearings` hearings that each add a word.
    mutating func secondsPerHearing(hearings: Int) -> Double {

        let elapsed = ContinuousClock().measure {
            for _ in 0..<hearings { segments.hear(spoken.next()) }
        }
        return (Double(elapsed.components.attoseconds) / 1e18 + Double(elapsed.components.seconds)) / Double(hearings)
    }

    /// The words said that the segments no longer hold, so dropping history
    /// cannot pass for keeping up.
    var lost: Int {

        let said = (0..<spoken.count).map { "w\($0)" }
        let held = segments.all.flatMap { $0.words.map(\.text) }
        return held.difference(from: said).removals.count
    }
}

private struct Speaker {

    private var time = 0.0
    private(set) var count = 0

    /// Reports the newest word with the one before it, as a recogniser revises its tail.
    mutating func next() -> Hearing {

        if (time.truncatingRemainder(dividingBy: 12)) >= 8 { time += 4 }
        let previous = Word("w\(count - 1)", start: time - 0.4, end: time - 0.1)
        let word = Word("w\(count)", start: time, end: time + 0.3)
        count += 1
        time += 0.4
        return Hearing(words: count > 1 ? [previous, word] : [word], from: count > 1 ? previous.start : word.start, finalThrough: time - 1)
    }
}
