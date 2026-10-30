import SplitRows

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
            var appended: [ReadingTextUpdate.Entry.ID] = []
            // Only listening replaces the log; a status transition cannot
            // take away what was read before recognition was interrupted.
            switch update.status {
            case .listening:
                let present = Set(update.entries.map(\.id))
                // Sealed entries are final: they stay, and updates no longer carry them.
                let removed = state.text.tail.keys.filter { !present.contains($0) }
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
                    let isLast = insert(entry.id, into: &state)
                    if isLast, !entry.writtenLater, !hasGaps(state) { appended.append(entry.id) } else { needsLayout = true }
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
            let newlyFinal = update.entries.prefix(max(update.finalCount - update.from, 0)).map(\.id)
            for id in newlyFinal {
                state.anchors.seal(id)
                state.text.seal(id)
                state.rendered.entries.seal(id)
            }
            if needsLayout {
                rebuildLayout(&state)
            } else {
                for id in appended {
                    state.rendered.locations[id] = .init(row: state.lines.rows.count, lateEntry: nil)
                    state.lines.rows.append(.entry(state.rendered.entries[id]!))
                }
                for id in changed where !appended.contains(id) { replaceRow(id, in: &state) }
                for id in newlyFinal { state.rendered.locations.seal(id) }
                sealRows(&state)
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

    /// Places the entry in call order; true when it went last.
    @discardableResult
    private static func insert(_ id: ReadingTextUpdate.Entry.ID, into state: inout ReadingState) -> Bool {

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
        return lower == state.rendered.ordered.count - 1
    }

    private static func hasGaps(_ state: ReadingState) -> Bool {

        state.problems.contains { $0.kind != .callSilent }
    }

    /// Rows before the first that still holds a changeable entry cannot change.
    private static func sealRows(_ state: inout ReadingState) {

        let firstOpen = state.rendered.locations.tail.values.map(\.row).min()
        state.lines.rows.seal(upTo: firstOpen ?? state.lines.rows.count)
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
        state.rendered.locations.removeAll()
        state.lines.layout += 1
        func locate(_ id: ReadingTextUpdate.Entry.ID, _ location: ReadingState.Rendered.Location) {

            if state.text.isSealed(id) { state.rendered.locations.setSealed(id, location) }
            else { state.rendered.locations[id] = location }
        }
        var lateStart = 0.0
        var lateEnd = 0.0
        func flushLate() {

            guard !late.isEmpty else { return }
            for (index, id) in lateIDs.enumerated() {
                locate(id, .init(row: result.count, lateEntry: index))
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
                locate(id, .init(row: result.count, lateEntry: nil))
                result.append(.entry(entry))
            }
        }
        flushLate()
        for problem in gaps.dropFirst(gapIndex) { appendGap(problem) }
        state.lines.rows = .init(tail: result)
        sealRows(&state)
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
