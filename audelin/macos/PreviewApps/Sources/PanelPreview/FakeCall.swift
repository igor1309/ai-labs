import PanelUI

/// A scripted call that stands in for the recorder and the recogniser.
///
/// Each step is one chunk of audio: the phrase being spoken moves to its next
/// recognition stage, and the call clock moves on by `chunkSeconds`.
struct FakeCall: Equatable {

    struct Phrase: Equatable {

        var speaker: PanelState.Speaker
        /// What recognition shows after each chunk; the last stage has no
        /// pending text.
        var stages: [Stage]
    }

    struct Stage: Equatable {

        var settled: String
        var pending: String
    }

    let script: [Phrase]
    let chunkSeconds: Int
    /// Starts the script over when it ends, for a call as long as needed.
    let loops: Bool

    private(set) var isRecording = false
    private(set) var liveText = true
    /// The log scrolls to each new line; off while the reader is scrolled up.
    private(set) var followsLive = true
    /// Selections the reader holds, oldest first; each stays until let go.
    private(set) var holds: [PanelState.Held] = []
    private var newBelow = 0
    private var seconds = 0
    private var phrase = 0
    private var stage = 0
    private var entries: [PanelState.Entry] = []
    /// Phrases finished while live text was off, to fill in when it is back.
    private var missed: [PanelState.Entry] = []
    private var late: PanelState.Late?
    /// When the phrase being spoken started, as the gutter shows it.
    private var phraseTime = ""
    private var phraseMode = PhraseMode.live

    init(script: [Phrase] = .meeting, chunkSeconds: Int = 4, loops: Bool = false) {

        self.script = script
        self.chunkSeconds = chunkSeconds
        self.loops = loops
    }

    var isFinished: Bool { !loops && phrase >= script.count }

    var state: PanelState {

        guard isRecording else { return .init(recording: .off, log: .empty) }

        let lines = PanelState.Lines(late: late, entries: entries, holds: holds, newBelow: newBelow, followsLive: followsLive)
        let kept = entries.isEmpty && late == nil ? nil : lines

        return .init(
            recording: .on(elapsed: elapsed),
            log: liveText ? .lines(lines) : .liveTextOff(kept: kept)
        )
    }

    mutating func handle(_ event: PanelEvent) {

        switch event {
        case .start:
            self = .init(script: script, chunkSeconds: chunkSeconds, loops: loops)
            isRecording = true

        case .stop:
            isRecording = false

        case .switchLiveTextOn:
            setLiveText(true)

        case let .hold(selection):
            if !holds.contains(selection) { holds.append(selection) }

        case let .letGo(selection):
            holds.removeAll { $0 == selection }

        case let .scrolled(atBottom):
            if atBottom {
                followLive()
            } else {
                followsLive = false
            }

        case .jumpToLive:
            followLive()
        }
    }

    mutating func setLiveText(_ isOn: Bool) {

        guard isOn != liveText else { return }

        liveText = isOn

        if isOn {
            fillIn()
        } else {
            dropPending()
        }
    }

    /// Advances the call by one chunk.
    mutating func step() {

        guard isRecording, !isFinished else { return }

        let current = script[phrase % script.count]
        let shown = current.stages[stage]
        let isLast = stage == current.stages.count - 1

        if stage == 0 {
            phraseTime = clock
            phraseMode = liveText ? .live : .recordedOnly
        }

        switch phraseMode {
        case .live:
            show(current.speaker, shown)

        case .cut:
            break

        case .recordedOnly where isLast:
            if liveText {
                show(current.speaker, shown)
            } else {
                missed.append(entry(current.speaker, shown))
            }

        case .recordedOnly:
            break
        }

        if isLast {
            phrase += 1
            stage = 0
        } else {
            stage += 1
        }
        seconds += chunkSeconds
    }
}

private extension FakeCall {

    enum PhraseMode: Equatable {

        /// Shown as it is recognised.
        case live
        /// Live text went off while it was spoken: what had settled stays.
        case cut
        /// Started with live text off: recognised from the recording when
        /// it ends.
        case recordedOnly
    }

    /// The call clock as the panel header shows it.
    var elapsed: String {

        let (h, m, s) = (seconds / 3600, seconds / 60 % 60, seconds % 60)
        return [h, m, s].map { $0 < 10 ? "0\($0)" : "\($0)" }.joined(separator: ":")
    }

    /// Wall-clock time of the current chunk, as the gutter shows it; the call
    /// started at 12:41.
    var clock: String {

        let minutes = 12 * 60 + 41 + seconds / 60
        let m = minutes % 60
        return "\(minutes / 60):\(m < 10 ? "0\(m)" : "\(m)")"
    }

    func entry(_ speaker: PanelState.Speaker, _ stage: Stage) -> PanelState.Entry {

        .init(
            id: phrase,
            time: phraseTime,
            speaker: speaker,
            settled: stage.settled,
            pending: stage.pending
        )
    }

    mutating func show(_ speaker: PanelState.Speaker, _ stage: Stage) {

        if let index = entries.firstIndex(where: { $0.id == phrase }) {
            entries[index].settled = stage.settled
            entries[index].pending = stage.pending
        } else {
            entries.append(entry(speaker, stage))
            if !followsLive { newBelow += 1 }
        }
    }

    mutating func followLive() {

        followsLive = true
        newBelow = 0
    }

    /// Live text went off: the phrase being spoken keeps what had settled.
    mutating func dropPending() {

        guard phraseMode == .live, stage > 0,
              let last = entries.indices.last, entries[last].id == phrase
        else { return }

        entries[last].pending = ""
        if entries[last].settled.isEmpty { entries.removeLast() }
        phraseMode = .cut
    }

    /// Live text is back: what was only recorded is filled in.
    mutating func fillIn() {

        guard let first = missed.first else { return }

        late = .init(span: "\(first.time)–\(clock)", entries: (late?.entries ?? []) + missed)
        missed.removeAll()
    }
}
