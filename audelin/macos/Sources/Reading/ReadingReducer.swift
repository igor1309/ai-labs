/// Decides what to read without starting work or changing the recording.
public struct ReadingReducer: Sendable {

    private let recordingTime: @Sendable (Double) -> String
    private let lineTime: @Sendable (Double) -> String
    private let layout: @Sendable (inout ReadingLayout, ReadingLayout.Change) -> Void

    public init(
        recordingTime: @escaping @Sendable (Double) -> String,
        lineTime: @escaping @Sendable (Double) -> String,
        layout: @escaping @Sendable (inout ReadingLayout, ReadingLayout.Change) -> Void
    ) {

        self.recordingTime = recordingTime
        self.lineTime = lineTime
        self.layout = layout
    }

    public func reduce(_ state: ReadingState, _ event: ReadingEvent) -> (ReadingState, Never?) {

        var state = state
        switch event {
        case let .recordingChanged(recording):
            switch recording {
            case .off:
                let removesGaps = hasGaps(state)
                let wasPrepared = state.rendered.prepared
                state.recording = .off
                state.problems = []
                state.banners = []
                prepareRows(&state)
                if wasPrepared && removesGaps { rebuildLayout(&state) }
            case let .on(elapsed): state.recording = .on(elapsed: recordingTime(elapsed))
            }
        case let .problemsChanged(problems):
            let previous = state.problems
            state.problems.removeAll { $0.kind == .callSilent && !problems.contains(where: { $0.kind == .callSilent }) }
            for problem in problems where !state.problems.contains(where: { $0.kind == problem.kind }) {
                state.problems.append(problem)
            }
            if state.problems != previous {
                state.banners = state.problems.enumerated().sorted {
                    $0.element.began == $1.element.began ? $0.offset > $1.offset : $0.element.began > $1.element.began
                }.map { problem in
                    state.banners.first { $0.kind == problem.element.kind }
                        ?? .init(kind: problem.element.kind, time: lineTime(problem.element.began))
                }
            }
            let wasPrepared = state.rendered.prepared
            prepareRows(&state)
            if wasPrepared,
               previous.filter({ $0.kind != .callSilent }) != state.problems.filter({ $0.kind != .callSilent }) {
                rebuildLayout(&state)
            }
        case let .textUpdated(update):
            prepareRows(&state)
            state.status = update.status
            let previousID = state.nextDisplayID
            layOut(&state, .text(update))
            if !state.lines.followsLive { state.lines.newBelow += state.nextDisplayID - previousID }
        case let .hold(held):
            if !state.lines.holds.contains(held) { state.lines.holds.append(held) }
        case let .letGo(held):
            state.lines.holds.removeAll { $0 == held }
        case let .scrolled(atBottom, interaction):
            if let interaction { state.scrollAcknowledgement = interaction }
            state.lines.followsLive = atBottom
            if atBottom { state.lines.newBelow = 0 }
        case let .namesConfirmed(names):
            func confirm(_ entries: inout [ReadingTextUpdate.Entry.ID: ReadingState.Entry]) {
                for (id, entry) in entries where id.speaker == .theirs {
                    var entry = entry
                    entry.name = names[id.localID]
                    entry.nameConfirmed = entry.name != nil
                    entries[id] = entry
                }
            }
            confirm(&state.rendered.entries.sealed)
            confirm(&state.rendered.entries.tail)
            if state.rendered.prepared { rebuildLayout(&state) }
        case let .speakersFound(places):
            func place(_ entries: inout [ReadingTextUpdate.Entry.ID: ReadingState.Entry]) {
                for (id, entry) in entries where id.speaker == .theirs {
                    var entry = entry
                    entry.remoteSpeaker = places[id.localID]
                    entries[id] = entry
                }
            }
            place(&state.rendered.entries.sealed)
            place(&state.rendered.entries.tail)
            if state.rendered.prepared { rebuildLayout(&state) }
        case .jumpToLive:
            state.lines.followsLive = true
            state.lines.newBelow = 0
        }
        switch state.status {
        case .off:
            let kept = state.lines.rows.isEmpty && state.lines.holds.isEmpty ? nil : state.lines
            state.log = state.recording == .off ? kept.map(ReadingState.Log.lines) ?? .empty : .liveTextOff(kept: kept)
        case .gettingReady:
            state.log = state.banners.isEmpty ? .preparing(holds: state.lines.holds) : .lines(state.lines)
        case .listening, .failed, .finished:
            state.log = .lines(state.lines)
        }
        return (state, nil)
    }

    private func hasGaps(_ state: ReadingState) -> Bool {
        state.problems.contains { $0.kind != .callSilent }
    }

    private func prepareRows(_ state: inout ReadingState) {
        guard !state.rendered.prepared else { return }
        layOut(&state, .prepare)
    }

    private func rebuildLayout(_ state: inout ReadingState) {
        layOut(&state, .rebuild)
    }

    private func layOut(_ state: inout ReadingState, _ change: ReadingLayout.Change) {
        var value = ReadingLayout(anchors: state.anchors, nextDisplayID: state.nextDisplayID,
                                  text: state.text, rendered: state.rendered, rows: state.lines.rows,
                                  revision: state.lines.layout, problems: state.problems)
        layout(&value, change)
        state.anchors = value.anchors
        state.nextDisplayID = value.nextDisplayID
        state.text = value.text
        state.rendered = value.rendered
        state.lines.rows = value.rows
        state.lines.layout = value.revision
    }
}
