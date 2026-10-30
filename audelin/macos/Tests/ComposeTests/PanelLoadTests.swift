@testable import CallText
import Foundation
import PanelUI
import Reading
import Testing
@testable import Compose

/// The panel maps and reduces each text state on the main actor. A state late
/// in a long call must cost about what one early does, or the panel's work
/// grows with the call however rarely the text changes. How many states
/// arrive per audio second is the session's to bound; the main actor's load
/// is the two together.
@Suite(.timeLimit(.minutes(1)))
struct PanelLoadTests {

    static let states = 100
    /// The most text states per audio second the composed session sends, to
    /// put the cost in terms of the main actor.
    static let todaysRate = 10.0

    @Test func aTextStateLateInALongCallCostsThePanelAboutWhatAnEarlyOneDoes() async throws {

        // The quickest of three runs each, so a busy machine slows neither side alone.
        var early = Double.infinity, late = Double.infinity
        for _ in 0..<3 {
            early = min(early, try await secondsPerState(entries: 20))
            late = min(late, try await secondsPerState(entries: 1_620))
        }
        let busy = Int(late * Self.todaysRate * 100)
        let line = "panel load: \(early * 1000) ms a state early, \(late * 1000) ms late; "
            + "at today's rate the model alone would keep the main actor \(busy)% busy late\n"
        FileHandle.standardError.write(Data(line.utf8))
        FileHandle.standardError.write(Data("panel load late, per step: \(steps(entries: 1_620))\n".utf8))
        withKnownIssue("every state maps and reduces the whole call's entries") {
            #expect(late / early <= 3, "a state late in a long call costs the panel \(late / early)x one early")
        }
    }

    /// Where a state's time goes: each step the panel takes, timed apart.
    private func steps(entries count: Int) -> String {

        let feed = feed(entries: count)
        var reading = ReadingReducer.reduce(ReadingState(), .recordingChanged(.on(elapsed: 0))).0
        var shown = panelState(reading)
        var times = [Duration](repeating: .zero, count: 5)
        let clock = ContinuousClock()
        for state in feed {
            var update: ReadingTextUpdate?
            times[0] += clock.measure { update = readingText(state) }
            let previous = reading
            times[1] += clock.measure { reading = ReadingReducer.reduce(reading, .textUpdated(update!)).0 }
            times[2] += clock.measure { _ = reading == previous }
            var next: PanelState?
            times[3] += clock.measure { next = panelState(reading) }
            times[4] += clock.measure { _ = next == shown }
            shown = next!
        }
        let names = ["mapping the text", "reducing", "comparing reading states", "mapping the panel", "comparing panel states"]
        return zip(names, times).map { name, time in
            let ms = (Double(time.components.seconds) + Double(time.components.attoseconds) / 1e18) * 1000 / Double(feed.count)
            return "\(name) \(String(format: "%.2f", ms)) ms"
        }.joined(separator: ", ")
    }

    /// States that each carry the whole call's `entries` with its last one growing.
    private func feed(entries count: Int) -> [State] {

        let words = String(repeating: "word ", count: 20)
        var history: [State.Entry] = []
        for index in 0..<count - 1 {
            let begins = Double(index) * 6
            let text = Text(id: index / 2, start: begins, end: begins + 5, settled: words, pending: "")
            history.append(State.Entry(speaker: index % 2 == 0 ? .mine : .theirs, text: text, writtenLater: false))
        }
        let start = Double(count) * 6
        var feed: [State] = []
        for step in 0..<Self.states {
            let text = Text(id: count, start: start, end: start + Double(step) / Self.todaysRate, settled: "", pending: "w\(step)")
            feed.append(State(status: .listening, entries: history + [State.Entry(speaker: .mine, text: text, writtenLater: false)]))
        }
        return feed
    }

    /// Feeds the panel `feed(entries:)` and times until it shows the last, per state.
    private func secondsPerState(entries count: Int) async throws -> Double {

        let states = Self.states
        let feed = feed(entries: count)

        let clock = ReadingClockSpy()
        let panel = clock.panel()
        let input = AsyncStream<State>.makeStream()
        let subscription = await panel.begin(id: 1, text: input.stream, enableLiveText: {})
        await subscription.recordingChanged(.on(elapsed: 0))
        var shown = await panel.states().makeAsyncIterator()

        let began = ContinuousClock.now
        for state in feed { input.continuation.yield(state) }
        let last = "w\(states - 1)"
        while let state = await shown.next() {
            if case let .lines(lines) = state.log, case let .entry(entry) = lines.rows.last, entry.pending == last { break }
        }
        let elapsed = ContinuousClock.now - began

        input.continuation.finish()
        await panel.end(id: 1)
        await subscription.end()
        return (Double(elapsed.components.seconds) + Double(elapsed.components.attoseconds) / 1e18) / Double(states)
    }
}
