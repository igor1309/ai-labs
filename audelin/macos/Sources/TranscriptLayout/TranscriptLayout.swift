/// Pure layout of one call; every value retained between updates belongs to the caller.
public struct TranscriptLayout: Sendable {
    private let lineTime: @Sendable (Double) -> String
    private let span: @Sendable (String, String) -> String

    public init(
        lineTime: @escaping @Sendable (Double) -> String,
        span: @escaping @Sendable (String, String) -> String
    ) {
        self.lineTime = lineTime
        self.span = span
    }

    public func prepare<S: LayoutStorage>(_ state: inout S) {
        guard !state.prepared else { return }
        state.prepared = true
        for text in state.textValues {
            let id = state.timing(text).id
            insert(id, into: &state)
            state.setEntry(id, displayEntry(text, in: state))
        }
        rebuild(&state)
    }

    /// `entries` is the producer's changeable suffix; final entries before it stay sealed.
    public func update<S: LayoutStorage>(
        _ state: inout S, entries: [S.Text], replacing: Bool, newlyFinal: Int
    ) {
        var needsLayout = false
        var touchesSealedRows = false
        var changed: Set<S.Key> = []
        var appended: [S.Key] = []
        if replacing {
            let present = Set(entries.map { state.timing($0).id })
            let removed = state.tailKeys.filter { !present.contains($0) }
            if !removed.isEmpty {
                needsLayout = true
                let gone = Set(removed)
                state.ordered.removeAll { gone.contains($0) }
                for id in removed { state.remove(id) }
            }
        }
        for text in entries {
            let timing = state.timing(text)
            let id = timing.id
            let previous = state.text(id)
            if state.anchor(id) == nil {
                state.setAnchor(id, .init(id: state.nextDisplayID, start: timing.start))
                state.nextDisplayID += 1
                let index = insert(id, into: &state)
                let isLast = index == state.ordered.count - 1
                if index < state.inSealedRows { touchesSealedRows = true }
                if isLast, !timing.writtenLater, state.gaps.isEmpty { appended.append(id) }
                else { needsLayout = true }
            }
            guard previous != text else { continue }
            let before = previous.map { state.timing($0) }
            if before?.writtenLater != timing.writtenLater
                || (timing.writtenLater && before?.end != timing.end) {
                needsLayout = true
            }
            state.setText(id, text)
            state.setEntry(id, displayEntry(text, in: state))
            changed.insert(id)
        }
        let finalIDs = entries.prefix(max(newlyFinal, 0)).map { state.timing($0).id }
        for id in finalIDs { state.seal(id) }
        if needsLayout {
            rebuild(&state, keepingSealedRows: !touchesSealedRows && state.gaps.isEmpty)
        } else {
            for id in appended {
                state.setLocation(id, .init(row: state.rowCount))
                state.appendRow(.entry(state.entry(id)!))
            }
            for id in changed where !appended.contains(id) { replaceRow(id, in: &state) }
            for id in finalIDs { state.sealLocation(id) }
            sealRows(&state)
        }
    }

    @discardableResult
    private func insert<S: LayoutStorage>(_ id: S.Key, into state: inout S) -> Int {
        let anchor = state.anchor(id)!
        var lower = 0
        var upper = state.ordered.count
        while lower < upper {
            let middle = lower + (upper - lower) / 2
            let other = state.anchor(state.ordered[middle])!
            if other.start == anchor.start ? other.id < anchor.id : other.start < anchor.start {
                lower = middle + 1
            } else { upper = middle }
        }
        state.ordered.insert(id, at: lower)
        return lower
    }

    private func displayEntry<S: LayoutStorage>(_ text: S.Text, in state: S) -> S.Entry {
        let anchor = state.anchor(state.timing(text).id)!
        return state.display(text, anchor: anchor, time: lineTime(anchor.start))
    }

    private func replaceRow<S: LayoutStorage>(_ id: S.Key, in state: inout S) {
        let location = state.location(id)!
        let entry = state.entry(id)!
        if let index = location.lateEntry, case let .late(span, entries) = state.row(location.row) {
            var entries = entries
            entries[index] = entry
            state.setRow(location.row, .late(span: span, entries: entries))
        } else { state.setRow(location.row, .entry(entry)) }
    }

    /// A final late group stays open so the next recovered entry can join it.
    private func sealRows<S: LayoutStorage>(_ state: inout S) {
        var end = state.tailLocations.map(\.row).min() ?? state.rowCount
        while end > state.sealedRowCount, case .late = state.row(end - 1) { end -= 1 }
        guard end > state.sealedRowCount else { return }
        for index in state.sealedRowCount..<end {
            switch state.row(index) {
            case .entry: state.inSealedRows += 1
            case let .late(_, entries): state.inSealedRows += entries.count
            case .gap: break
            }
        }
        state.sealRows(upTo: end)
    }

    /// Keeping the sealed prefix requires that neither new text nor gaps fall among it.
    public func rebuild<S: LayoutStorage>(_ state: inout S, keepingSealedRows: Bool = false) {
        let kept = keepingSealedRows ? state.sealedRowCount : 0
        var result: [LayoutRow<S.Entry, S.Gap>] = []
        var late: [S.Entry] = []
        var lateIDs: [S.Key] = []
        state.clearLocations(keepingSealed: keepingSealedRows)
        if !keepingSealedRows {
            state.inSealedRows = 0
            state.revision += 1
        }
        var lateStart = 0.0
        var lateEnd = 0.0
        func flushLate() {
            guard !late.isEmpty else { return }
            for (index, id) in lateIDs.enumerated() {
                state.setLocation(id, .init(row: kept + result.count, lateEntry: index))
            }
            lateIDs = []
            result.append(.late(span: span(lineTime(lateStart), lineTime(lateEnd)), entries: late))
            late = []
        }
        let gaps = state.gaps.enumerated().sorted {
            $0.element.began == $1.element.began ? $0.offset < $1.offset : $0.element.began < $1.element.began
        }.map(\.element)
        var gapIndex = 0
        func appendGap(_ gap: GapMarker<S.Gap>) {
            flushLate()
            result.append(.gap(gap.content, time: lineTime(gap.began)))
        }
        for id in state.ordered[state.inSealedRows...] {
            let timing = state.timing(state.text(id)!)
            let anchor = state.anchor(id)!
            while gapIndex < gaps.count, gaps[gapIndex].began <= anchor.start {
                appendGap(gaps[gapIndex])
                gapIndex += 1
            }
            let entry = state.entry(id)!
            if timing.writtenLater {
                if late.isEmpty { lateStart = anchor.start; lateEnd = timing.end }
                lateEnd = max(lateEnd, timing.end)
                late.append(entry)
                lateIDs.append(id)
            } else {
                flushLate()
                state.setLocation(id, .init(row: kept + result.count))
                result.append(.entry(entry))
            }
        }
        flushLate()
        for gap in gaps.dropFirst(gapIndex) { appendGap(gap) }
        state.replaceRows(keepingSealed: keepingSealedRows, tail: result)
        sealRows(&state)
    }
}
