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
            if wasPrepared, gapProblems(previous) != gapProblems(state.problems) {
                rebuildLayout(&state)
            }
        case let .textUpdated(update):
            prepareRows(&state)
            state.status = update.status
            let previousID = state.nextDisplayID
            state.latestText = update.entries.map(\.id)
            let mapped = state.lines.rows.sealed.count
            layOut(&state, .text(update))
            identifySpeakers(&state, ids: state.latestText, mapped: mapped)
            if !state.lines.followsLive { state.lines.newBelow += state.nextDisplayID - previousID }
        case let .hold(held):
            if !state.lines.holds.contains(held) { state.lines.holds.append(held) }
        case let .letGo(held):
            state.lines.holds.removeAll { $0 == held }
        case let .scrolled(atBottom, interaction):
            if let interaction { state.scrollAcknowledgement = interaction }
            state.lines.followsLive = atBottom
            if atBottom { state.lines.newBelow = 0 }
        case let .namesChanged(names, confirmed):
            guard names != state.names || confirmed != state.namesConfirmed else { break }
            state.names = names
            state.namesConfirmed = confirmed
            let ids = confirmed ? Array(state.rendered.entries.sealed.keys) + Array(state.rendered.entries.tail.keys) : state.latestText
            identifySpeakers(&state, ids: ids, mapped: state.lines.rows.sealed.count)
        case let .speakersFound(places):
            state.speakerPlaces = places
            for id in Array(state.rendered.entries.sealed.keys) + Array(state.rendered.entries.tail.keys) {
                if let entry = state.rendered.entries[id] { state.rendered.entries[id] = identified(entry, id, in: state) }
            }
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

    /// A remote entry's name, its confirmation and its speaker place, from the latest sets.
    private func identified(_ entry: ReadingState.Entry, _ id: ReadingTextUpdate.Entry.ID, in state: ReadingState) -> ReadingState.Entry {
        guard id.speaker == .theirs else { return entry }
        var entry = entry
        entry.name = state.names[id.localID]
        entry.nameConfirmed = state.namesConfirmed && entry.name != nil
        entry.remoteSpeaker = state.speakerPlaces[id.localID]
        return entry
    }

    /// Identifies the given entries in place. Rows below `mapped` were sealed before
    /// this event and the panel may have mapped them, so changing one remaps that prefix;
    /// rows sealed by this event are new to the panel.
    private func identifySpeakers(_ state: inout ReadingState, ids: [ReadingTextUpdate.Entry.ID], mapped: Int) {
        for id in ids where id.speaker == .theirs {
            guard let current = state.rendered.entries[id] else { continue }
            let entry = identified(current, id, in: state)
            guard current != entry else { continue }
            state.rendered.entries[id] = entry
            guard let location = state.rendered.locations[id] else { continue }
            if let index = location.lateEntry, case var .late(group) = state.lines.rows[location.row] {
                group.entries[index] = entry
                state.lines.rows[location.row] = .late(group)
            } else {
                state.lines.rows[location.row] = .entry(entry)
            }
            if location.row < mapped { state.lines.layout += 1 }
        }
    }

    private func hasGaps(_ state: ReadingState) -> Bool {
        !gapProblems(state.problems).isEmpty
    }

    /// The problems that leave a gap in the rows: call silence adds only a banner.
    private func gapProblems(_ problems: [ReadingProblem]) -> [ReadingProblem] {
        problems.filter { $0.kind != .callSilent }
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
                                  revision: state.lines.layout, problems: gapProblems(state.problems))
        layout(&value, change)
        state.anchors = value.anchors
        state.nextDisplayID = value.nextDisplayID
        state.text = value.text
        state.rendered = value.rendered
        state.lines.rows = value.rows
        state.lines.layout = value.revision
    }
}
