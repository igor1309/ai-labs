import Reading

extension StateLog {

    func reading(_ state: ReadingState) {

        let recording = switch state.recording { case .off: "off"; case .on: "on" }
        let mode: String
        let holds: Int
        let lines: ReadingState.Lines?
        switch state.log {
        case .empty:
            mode = "empty"; lines = nil; holds = 0
        case let .preparing(kept):
            mode = "preparing"; lines = nil; holds = kept.count
        case let .liveTextOff(kept):
            mode = "liveTextOff"; lines = kept; holds = kept?.holds.count ?? 0
        case let .lines(value):
            mode = "lines"; lines = value; holds = value.holds.count
        }
        sink.write(.init(
            category: .reading,
            message: "state recording=\(recording) log=\(mode) rows=\(lines?.rows.count ?? 0) entries=\(lines?.entries.count ?? 0) holds=\(holds) newBelow=\(lines?.newBelow ?? 0) followsLive=\(lines?.followsLive ?? true)"
        ))
    }
}
