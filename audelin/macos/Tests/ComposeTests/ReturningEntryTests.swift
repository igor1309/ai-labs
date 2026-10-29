import protocol CallText.Side
import struct CallText.SideState
import Reading
import struct SideText.Audio
import struct SideText.Text
import Synchronization
import Testing
@testable import Compose

/// The call text can fall behind a side while it merges a long call's
/// entries. An entry the recogniser drops, whose id then comes back for new
/// words later, must still read as a new entry at its own time, and each
/// entry keeps one identity while its words grow.
@Suite(.timeLimit(.minutes(1)))
struct ReturningEntryTests {

    @Test func anEntryWhoseIdReturnsWhileTheCallTextIsBehindReadsAsNew() async {

        let audio = TextAudio()
        let engine = ScriptedEngine(script: [
            [.init(id: 0, start: 2, end: 3, pending: "old")],
            [.init(id: 0, start: 2, end: 4, pending: "old more")],
            [],
            [.init(id: 0, start: 12, end: 13, pending: "new")],
            [.init(id: 0, start: 12, end: 14, pending: "new more")],
        ])
        let behind = Signal(), caughtUp = Signal()
        let speaking = StallingSide(
            side: CallSide(audio: audio, text: engine, written: TextTrack(chunks: []), sampleRate: 1),
            after: { $0.entries.map(\.text.pending) == ["old more"] }, behind: behind, caughtUp: caughtUp
        )
        let quietAudio = TextAudio()
        let quiet = CallSide(audio: quietAudio, text: ScriptedEngine(script: []), written: TextTrack(chunks: []), sampleRate: 1)
        let text = CallReader(microphone: speaking, call: quiet)
        let reading = Task {
            var state = ReadingState()
            var shown: [ReadingState.Entry] = []
            for await update in text.updates {
                state = ReadingReducer.reduce(state, .textUpdated(readingText(update))).0
                guard case let .lines(lines) = state.log else { continue }
                for entry in lines.entries where shown.last != entry { shown.append(entry) }
                if lines.entries.last?.pending == "new more" { break }
            }
            return shown
        }
        await text.start(enabled: true)
        await speaking.listening()
        for second in 0..<2 {
            await audio.send(.init(start: Double(second), samples: [0], sampleRate: 1))
        }
        await behind.next()
        for second in 2..<5 {
            await audio.send(.init(start: Double(second), samples: [0], sampleRate: 1))
        }
        caughtUp.send()

        let shown = await reading.value
        let old = shown.filter { $0.pending.hasPrefix("old") }, new = shown.filter { $0.pending.hasPrefix("new") }
        #expect(old.map(\.pending) == ["old", "old more"])
        #expect(Set(old.map(\.time)) == ["00:02"])
        #expect(Set(old.map(\.id)).count == 1, "the old entry changed identity as it grew")
        #expect(Set(new.map(\.id)).count == 1, "the new entry changed identity as it grew")
        // A known bug: the side keeps only its newest snapshot, so the one leaving the entry out is lost.
        withKnownIssue("an id that returns while the call text is behind continues the old entry") {
            #expect(Set(new.map(\.time)) == ["00:12"])
            #expect(Set(old.map(\.id)).isDisjoint(with: new.map(\.id)))
        }

        audio.end()
        quietAudio.end()
        await text.stop()
    }
}

/// Holds the call text's receipt after a matching snapshot, as a busy merge would.
private final class StallingSide: Side, Sendable {

    private let side: CallSide
    private let after: @Sendable (SideState) -> Bool
    private let behind: Signal
    private let caughtUp: Signal
    private let held = Mutex(false)
    private let ready = Signal()

    init(side: CallSide, after: @escaping @Sendable (SideState) -> Bool, behind: Signal, caughtUp: Signal) {

        self.side = side
        self.after = after
        self.behind = behind
        self.caughtUp = caughtUp
    }

    func listening() async { await ready.next() }

    func listen(_ receive: @escaping @Sendable (SideState) async -> Void) async {

        await side.listen { [self] snapshot in
            await receive(snapshot)
            if snapshot.status == .listening, snapshot.entries.isEmpty { ready.send() }
            guard after(snapshot), held.withLock({ held in defer { held = true }; return !held }) else { return }
            behind.send()
            await caughtUp.next()
        }
    }

    func start(enabled: Bool) async { await side.start(enabled: enabled) }
    func setEnabled(_ enabled: Bool) async { await side.setEnabled(enabled) }
    func stop() async { await side.stop() }
}

/// Answers each hearing with the next scripted text, then keeps the last.
actor ScriptedEngine: TextEngine {

    private var script: [[SideText.Text]]
    private var latest: [SideText.Text] = []

    init(script: [[SideText.Text]]) { self.script = script }

    func prepare() {}

    func hear(_ audio: SideText.Audio) -> [SideText.Text] {

        if !script.isEmpty { latest = script.removeFirst() }
        return latest
    }

    func finish() -> [SideText.Text] { latest }

    func shutdown() {}
}
