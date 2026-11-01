@testable import CallText
import Foundation
import LiveText
import PanelUI
import Reading
import SessionRehearsal
import Synchronization
import Testing
@testable import Composer

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
            early = min(early, try await secondsPerUpdate(entries: 20))
            late = min(late, try await secondsPerUpdate(entries: 1_620))
        }
        let busy = Int(late * Self.todaysRate * 100)
        let line = report("\(early * 1000) ms an update early, \(late * 1000) ms late; "
            + "at today's rate the model alone would keep the main actor \(busy)% busy late")
        FileHandle.standardError.write(Data(line.utf8))
        #expect(late / early <= 3, "a state late in a long call costs the panel \(late / early)x one early")
    }

    /// The panel's own steps apart from the session around them.
    @Test func eachStepOfATextStateCostsAboutTheSameLateAsEarly() {

        var early = Double.infinity, late = Double.infinity
        for _ in 0..<3 {
            early = min(early, seconds(steps(entries: 20).reduce(.zero, +)))
            late = min(late, seconds(steps(entries: 1_620).reduce(.zero, +)))
        }
        let names = ["mapping the text", "reducing", "comparing reading states", "mapping the panel", "comparing panel states"]
        let perStep = zip(names, steps(entries: 1_620)).map { name, time in
            "\(name) \(String(format: "%.2f", seconds(time) * 1000 / Double(Self.states - 1))) ms"
        }
        FileHandle.standardError.write(Data(report("late, per step: \(perStep.joined(separator: ", "))").utf8))
        #expect(late / early <= 3, "the steps of a state late in a long call cost \(late / early)x one early")
    }

    @Test func loadReportNamesTheCompiledBuild() {
        var build = "optimized"
        // The assertion's autoclosure runs only when debug assertions are enabled.
        assert({ build = "debug"; return true }())
        #expect(report("measurement") == "panel load (\(build)): measurement\n")
    }

    private func report(_ measurement: String) -> String {
        let build = _isDebugAssertConfiguration() ? "debug" : "optimized"
        return "panel load (\(build)): \(measurement)\n"
    }

    /// Where a state's time goes: each step the panel takes, timed apart.
    private func steps(entries count: Int) -> [Duration] {

        let feed = feed(entries: count)
        var reading = ReadingReducer.reduce(ReadingState(), .recordingChanged(.on(elapsed: 0))).0
        var times = [Duration](repeating: .zero, count: 5)
        let clock = ContinuousClock()
        // The call is already there: only the states after it are the cost of a late state.
        reading = ReadingReducer.reduce(reading, .textUpdated(readingText(feed[0]))).0
        var rows = MappedRows()
        var shown = panelState(reading, rows: &rows)
        var mapped = feed[0].finalCount
        for state in feed.dropFirst() {
            var update: ReadingTextUpdate?
            times[0] += clock.measure { update = readingText(state, from: mapped) }
            mapped = state.finalCount
            let previous = reading
            times[1] += clock.measure { reading = ReadingReducer.reduce(reading, .textUpdated(update!)).0 }
            times[2] += clock.measure { _ = reading == previous }
            var next: PanelState?
            times[3] += clock.measure { next = panelState(reading, rows: &rows) }
            times[4] += clock.measure { _ = next == shown }
            shown = next!
        }
        return times
    }

    /// States that each carry the whole call's `entries` with its last one
    /// growing and all before it final, as both sides speaking gives.
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
            var state = State(status: .listening, entries: history + [State.Entry(speaker: .mine, text: text, writtenLater: false)])
            state.finalCount = history.count
            feed.append(state)
        }
        return feed
    }

    /// Feeds a composed session `entries` of speech at once, then one revision
    /// of the last at a time, and gives the mean of the panel's own updates
    /// after the first; the way from microphone to panel is the session's.
    @MainActor
    private func secondsPerUpdate(entries count: Int) async throws -> Double {

        let words = (0..<20).map { "word\($0)" }
        var history: [Word] = []
        for index in 0..<count - 1 {
            let begins = Double(index) * 6
            history += words.enumerated().map { Word($1, start: begins + Double($0) * 0.2, end: begins + Double($0) * 0.2 + 0.1) }
            history.append(Word("end.", start: begins + 4, end: begins + 5))
        }
        let start = Double(count) * 6
        let revision = { (step: Int) in Hearing(words: [Word("w\(step)", start: start, end: start + 0.1 + Double(step) / Self.todaysRate)], from: start) }
        let recognizer = ScriptRecognizer(
            hearings: [.success(Hearing(words: history + [Word("w0", start: start, end: start + 0.1)], finalThrough: start - 1))]
                + (1..<Self.states).map { .success(revision($0)) },
            endings: [.success(Hearing(words: []))]
        )
        let microphone = FedCapture(), call = FedCapture()
        defer { microphone.end(); call.end() }
        let updates = PanelUpdateTimes()
        var mean = 0.0
        try await withComposition(recognizers: (recognizer, QuietRecognizer(through: start + 60)), configure: { boundary in
            boundary.capturePersistence = .transient
            boundary.intervals = updates.intervals
            boundary.microphone = FixtureMicrophone { microphone.started }
            boundary.callAudio = FixtureCallAudio { _ in call.started }
        }) { rig in
            try await rig.start()
            call.send(Array(repeating: 0, count: Int(start + 60) * 50), rate: 50)
            var shown = await rig.menu.panelStates().makeAsyncIterator()
            // Only the last row and the tail's size: reading all the rows would itself grow with the call.
            func waitFor(_ pending: String) async {
                while let state = await shown.next() {
                    if case let .lines(lines) = state.log, lines.rows.tail.count < 20,
                       case let .entry(entry) = lines.rows.last, entry.pending == pending { return }
                }
            }
            // The call is already there and settled: only the states after it are the cost of a late state.
            microphone.send([0])
            await waitFor("w0")
            updates.reset()
            for step in 1..<Self.states {
                microphone.send([0])
                await waitFor("w\(step)")
            }
            mean = updates.mean
            try await rig.stop()
        }
        return mean
    }
}

private func seconds(_ duration: Duration) -> Double {
    Double(duration.components.seconds) + Double(duration.components.attoseconds) / 1e18
}

/// Times the composition's `PanelUpdate` intervals as they end.
private final class PanelUpdateTimes: Sendable {

    private let measured = Mutex((total: 0.0, count: 0))

    var intervals: ProfileIntervals {
        ProfileIntervals { name in
            guard String(describing: name) == "PanelUpdate" else { return {} }
            let began = ContinuousClock.now
            return {
                let elapsed = seconds(ContinuousClock.now - began)
                self.measured.withLock { $0.total += elapsed; $0.count += 1 }
            }
        }
    }

    var mean: Double { measured.withLock { $0.count == 0 ? 0 : $0.total / Double($0.count) } }

    func reset() { measured.withLock { $0 = (0, 0) } }
}

/// The other side of the call: it says it heard no word through the whole
/// call, which is what lets the first side's rows settle.
private struct QuietRecognizer: Recognizer {

    let through: Double

    func hear(_ chunk: AudioChunk) async throws -> Hearing { Hearing(words: [], noWordBefore: through) }
    func finish() async throws -> Hearing { Hearing(words: []) }
}
