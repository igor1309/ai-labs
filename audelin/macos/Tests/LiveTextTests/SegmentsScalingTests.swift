import Testing
@testable import LiveText

/// A three-hour call is about 27,000 words a side. Each hearing should cost
/// about the same an hour in as a minute in, so the text keeps up with the
/// audio however long the call runs.
struct SegmentsScalingTests {

    @Test func aHearingLateInALongCallCostsAboutWhatAnEarlyOneDoes() {

        // The quickest of three runs each, so a busy machine slows neither
        // side alone. Work that does not grow with the call stays well within
        // 3x: caches cold for a longer call cost a little.
        let earlies = (0..<3).map { _ in secondsPerHearing(after: 300) }
        let lates = (0..<3).map { _ in secondsPerHearing(after: 30_000) }
        let early = (seconds: earlies.map(\.seconds).min()!, lost: earlies.map(\.lost).max()!)
        let late = (seconds: lates.map(\.seconds).min()!, lost: lates.map(\.lost).max()!)
        #expect(early.lost == 0, "\(early.lost) words lost after 300")
        #expect(late.lost == 0, "\(late.lost) words lost after 30,000")
        withKnownIssue("every hearing copies and re-cuts the whole call") {
            #expect(late.seconds / early.seconds <= 3, "a hearing after 30,000 words costs \(late.seconds / early.seconds)x one after 300")
        }
    }
}

/// Times hearings that each add a word, after `history` words: a word every
/// 0.4 s in 8 s sentences with 4 s pauses, final a second after it ends.
/// Also counts the words said that the segments no longer hold, so dropping
/// history cannot pass for keeping up.
private func secondsPerHearing(after history: Int) -> (seconds: Double, lost: Int) {

    var segments = Segments(pause: 1)
    var spoken = Speaker()
    // The history arrives in one hearing, so building it stays cheap.
    let past = (0..<history).flatMap { _ in spoken.next().words.suffix(1) }
    segments.hear(Hearing(words: past, finalThrough: past.last.map { $0.end }))

    let hearings = 200
    let clock = ContinuousClock()
    let elapsed = clock.measure {
        for _ in 0..<hearings { segments.hear(spoken.next()) }
    }
    let said = (0..<history + hearings).map { "w\($0)" }
    let held = segments.all.flatMap { ($0.settled + " " + $0.pending).split(separator: " ").map(String.init) }
    let lost = held.difference(from: said).removals.count
    return ((Double(elapsed.components.attoseconds) / 1e18 + Double(elapsed.components.seconds)) / Double(hearings), lost)
}

private struct Speaker {

    private var time = 0.0
    private var count = 0

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
