/// Decides what to read without starting work or changing the recording.
public enum ReadingReducer {

    public static func reduce(_ state: ReadingState, _ event: ReadingEvent) -> (ReadingState, Never?) {

        var state = state
        switch event {
        case let .recordingChanged(recording):
            switch recording {
            case .off:
                state.recording = .off
                state.problems = []
                state.banners = []
                state.lines.rows = rows(state)
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
            state.lines.rows = rows(state)
        case let .textUpdated(update):
            state.status = update.status
            // Only listening replaces the log; a status transition cannot
            // take away what was read before recognition was interrupted.
            switch update.status {
            case .listening:
                let present = Set(update.entries.map(\.id))
                state.anchors = state.anchors.filter { present.contains($0.key) }
                state.text.removeAll(keepingCapacity: true)
            case .off, .gettingReady, .failed, .finished: break
            }
            for entry in update.entries {
                if state.anchors[entry.id] == nil {
                    state.anchors[entry.id] = .init(id: state.nextDisplayID, start: entry.start)
                    state.nextDisplayID += 1
                    if !state.lines.followsLive { state.lines.newBelow += 1 }
                }
                state.text[entry.id] = entry
            }
            state.lines.rows = rows(state)
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

    private static func rows(_ state: ReadingState) -> [ReadingState.Row] {

        let ordered = state.text.values.sorted { left, right in
            let a = state.anchors[left.id]!
            let b = state.anchors[right.id]!
            return a.start == b.start ? a.id < b.id : a.start < b.start
        }
        var result: [ReadingState.Row] = []
        var late: [ReadingState.Entry] = []
        var lateStart = 0.0
        var lateEnd = 0.0
        func flushLate() {

            guard !late.isEmpty else { return }
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
        for text in ordered {
            let anchor = state.anchors[text.id]!
            while gapIndex < gaps.count, gaps[gapIndex].began <= anchor.start {
                appendGap(gaps[gapIndex])
                gapIndex += 1
            }
            let entry = ReadingState.Entry(
                id: anchor.id, time: lineTime(anchor.start), speaker: text.id.speaker,
                settled: text.settled, pending: text.pending
            )
            if text.writtenLater {
                if late.isEmpty { lateStart = anchor.start; lateEnd = text.end }
                lateEnd = max(lateEnd, text.end)
                late.append(entry)
            } else {
                flushLate()
                result.append(.entry(entry))
            }
        }
        flushLate()
        for problem in gaps.dropFirst(gapIndex) { appendGap(problem) }
        return result
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
