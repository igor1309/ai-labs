/// Decides what to read without starting work or changing the recording.
public enum ReadingReducer {

    public static func reduce(_ state: ReadingState, _ event: ReadingEvent) -> (ReadingState, Never?) {

        var state = state
        state.work = .init()
        switch event {
        case let .recordingChanged(recording):
            switch recording {
            case .off:
                state.recording = .off
                state.problems = []
                state.banners = []
                prepareRows(&state)
                rebuildLayout(&state)
            case let .on(elapsed): state.recording = .on(elapsed: recordingTime(elapsed))
            }
        case let .problemsChanged(problems):
            state.problems.removeAll { $0.kind == .callSilent && !problems.contains(where: { $0.kind == .callSilent }) }
            for problem in problems where !state.problems.contains(where: { $0.kind == problem.kind }) {
                state.problems.append(problem)
            }
            state.banners = state.problems.enumerated().sorted {
                $0.element.began == $1.element.began ? $0.offset > $1.offset : $0.element.began > $1.element.began
            }.map { .init(kind: $0.element.kind, time: lineTime($0.element.began)) }
            prepareRows(&state)
            rebuildLayout(&state)
        case let .textUpdated(update):
            prepareRows(&state)
            state.status = update.status
            var needsLayout = false
            var changed: Set<ReadingTextUpdate.Entry.ID> = []
            // Only listening replaces the log; a status transition cannot
            // take away what was read before recognition was interrupted.
            switch update.status {
            case .listening:
                let present = Set(update.entries.map(\.id))
                let removed = state.text.keys.filter { !present.contains($0) }
                if !removed.isEmpty {
                    needsLayout = true
                    state.rendered.ordered.removeAll { !present.contains($0) }
                    for id in removed {
                        state.anchors[id] = nil
                        state.text[id] = nil
                        state.rendered.entries[id] = nil
                        state.rendered.locations[id] = nil
                    }
                }
            case .off, .gettingReady, .failed, .finished: break
            }
            for entry in update.entries {
                let previous = state.text[entry.id]
                if state.anchors[entry.id] == nil {
                    state.anchors[entry.id] = .init(id: state.nextDisplayID, start: entry.start)
                    state.nextDisplayID += 1
                    insert(entry.id, into: &state)
                    needsLayout = true
                    if !state.lines.followsLive { state.lines.newBelow += 1 }
                }
                guard previous != entry else { continue }
                if previous?.writtenLater != entry.writtenLater
                    || (entry.writtenLater && previous?.end != entry.end) {
                    needsLayout = true
                }
                state.text[entry.id] = entry
                state.rendered.entries[entry.id] = displayEntry(entry, in: &state)
                changed.insert(entry.id)
            }
            if needsLayout {
                rebuildLayout(&state)
            } else {
                for id in changed { replaceRow(id, in: &state) }
            }
        case let .hold(held):
            if !state.lines.holds.contains(held) { state.lines.holds.append(held) }
        case let .letGo(held):
            state.lines.holds.removeAll { $0 == held }
        case let .scrolled(atBottom):
            state.lines.followsLive = atBottom
            if atBottom { state.lines.newBelow = 0 }
        case .jumpToLive:
            state.lines.followsLive = true
            state.lines.newBelow = 0
        }
        return (state, nil)
    }

    private static func prepareRows(_ state: inout ReadingState) {

        guard !state.rendered.prepared else { return }
        state.rendered.prepared = true
        for text in state.text.values {
            insert(text.id, into: &state)
            state.rendered.entries[text.id] = displayEntry(text, in: &state)
        }
        rebuildLayout(&state)
    }

    private static func insert(_ id: ReadingTextUpdate.Entry.ID, into state: inout ReadingState) {

        let anchor = state.anchors[id]!
        var lower = 0
        var upper = state.rendered.ordered.count
        while lower < upper {
            let middle = lower + (upper - lower) / 2
            let other = state.anchors[state.rendered.ordered[middle]]!
            state.work.entryOrderComparisons += 1
            if other.start == anchor.start ? other.id < anchor.id : other.start < anchor.start {
                lower = middle + 1
            } else {
                upper = middle
            }
        }
        state.rendered.ordered.insert(id, at: lower)
    }

    private static func displayEntry(
        _ text: ReadingTextUpdate.Entry, in state: inout ReadingState
    ) -> ReadingState.Entry {

        let anchor = state.anchors[text.id]!
        state.work.rowsBuilt += 1
        return .init(id: anchor.id, time: lineTime(anchor.start), speaker: text.id.speaker,
                     settled: text.settled, pending: text.pending)
    }

    private static func replaceRow(_ id: ReadingTextUpdate.Entry.ID, in state: inout ReadingState) {

        let location = state.rendered.locations[id]!
        let entry = state.rendered.entries[id]!
        if let index = location.lateEntry, case let .late(group) = state.lines.rows[location.row] {
            var entries = group.entries
            entries[index] = entry
            state.lines.rows[location.row] = .late(.init(span: group.span, entries: entries))
        } else {
            state.lines.rows[location.row] = .entry(entry)
        }
    }

    private static func rebuildLayout(_ state: inout ReadingState) {

        var result: [ReadingState.Row] = []
        var late: [ReadingState.Entry] = []
        var lateIDs: [ReadingTextUpdate.Entry.ID] = []
        state.rendered.locations = [:]
        var lateStart = 0.0
        var lateEnd = 0.0
        func flushLate() {

            guard !late.isEmpty else { return }
            for (index, id) in lateIDs.enumerated() {
                state.rendered.locations[id] = .init(row: result.count, lateEntry: index)
            }
            lateIDs = []
            result.append(.late(.init(span: "\(lineTime(lateStart))–\(lineTime(lateEnd))", entries: late)))
            late = []
        }
        let gaps = state.problems.enumerated().filter { $0.element.kind != .callSilent }.sorted {
            $0.element.began == $1.element.began ? $0.offset < $1.offset : $0.element.began < $1.element.began
        }.map(\.element)
        var gapIndex = 0
        func appendGap(_ problem: ReadingProblem) {

            flushLate()
            let speaker: ReadingState.Speaker = switch problem.kind {
            case .callAudio, .callSilent: .theirs
            case .microphone: .mine
            case let .diskFull(side): side
            }
            result.append(.gap(.init(speaker: speaker, time: lineTime(problem.began), kind: problem.kind)))
        }
        for id in state.rendered.ordered {
            let text = state.text[id]!
            let anchor = state.anchors[id]!
            while gapIndex < gaps.count, gaps[gapIndex].began <= anchor.start {
                appendGap(gaps[gapIndex])
                gapIndex += 1
            }
            let entry = state.rendered.entries[id]!
            if text.writtenLater {
                if late.isEmpty { lateStart = anchor.start; lateEnd = text.end }
                lateEnd = max(lateEnd, text.end)
                late.append(entry)
                lateIDs.append(id)
            } else {
                flushLate()
                state.rendered.locations[id] = .init(row: result.count, lateEntry: nil)
                result.append(.entry(entry))
            }
        }
        flushLate()
        for problem in gaps.dropFirst(gapIndex) { appendGap(problem) }
        state.lines.rows = result
    }

    private static func seconds(_ value: Double) -> Int {

        guard value.isFinite, value > 0 else { return 0 }
        return Int(min(value.rounded(.down), Double(Int.max / 2)))
    }

    private static func padded(_ value: Int) -> String {

        value < 10 ? "0\(value)" : String(value)
    }

    private static func lineTime(_ value: Double) -> String {

        let seconds = seconds(value)
        return "\(padded(seconds / 60)):\(padded(seconds % 60))"
    }

    private static func recordingTime(_ value: Double) -> String {

        let seconds = seconds(value)
        return "\(padded(seconds / 3600)):\(padded(seconds / 60 % 60)):\(padded(seconds % 60))"
    }
}
