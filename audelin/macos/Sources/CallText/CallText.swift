/// Combines two sides' text, marking whose it is and switching them together.
/// A side whose text fails leaves the other side going.
public actor CallText {

    public nonisolated let updates: AsyncStream<State>
    public private(set) var state = State(status: .off, entries: [])

    private let continuation: AsyncStream<State>.Continuation
    private let sides: [any Side]
    private let sortedEntry: @Sendable (State.Entry) -> Void
    private var snapshots = [SideState](repeating: .init(status: .off, entries: []), count: 2)
    private var committed = [0, 0]
    private var listeners: [Task<Void, Never>] = []
    private var endedSides = [false, false]
    private var stopping: Task<Void, Never>?
    private var switching: Task<Void, Never>?
    private var started = false
    private var enabled = false
    private var ended = false

    public init(microphone: any Side, call: any Side) {

        self.init(microphone: microphone, call: call, sortedEntry: { _ in })
    }

    init(microphone: any Side, call: any Side, sortedEntry: @escaping @Sendable (State.Entry) -> Void) {

        sides = [microphone, call]
        self.sortedEntry = sortedEntry
        // An omitted entry can return under the same producer id in the next snapshot.
        (updates, continuation) = AsyncStream.makeStream()
    }

    public func start(enabled: Bool = true) async {

        guard !started, !ended, stopping == nil else { return }
        started = true
        self.enabled = enabled
        snapshots = sides.map { _ in .init(status: enabled ? .gettingReady : .off, entries: []) }
        listeners = sides.enumerated().map { index, side in
            Task { [weak self] in
                await side.listen { [weak self] snapshot in await self?.receive(snapshot, on: index) }
                await self?.sideEnded(on: index)
            }
        }
        publish()
        let operation = Task { [sides] in
            for side in sides { await side.start(enabled: enabled) }
        }
        switching = operation
        await operation.value
    }

    public func setEnabled(_ enabled: Bool) async {

        guard started, !ended, stopping == nil, self.enabled != enabled else { return }
        self.enabled = enabled
        snapshots = snapshots.map { snapshot in
            .init(
                status: snapshot.ended ? snapshot.status : (enabled ? .gettingReady : .off),
                finalEntries: snapshot.finalEntries, tailEntries: snapshot.tailEntries
            )
        }
        publish()
        // Side calls suspend, so each switch must wait for earlier propagation.
        let operation = Task { [sides, previous = switching] in
            await previous?.value
            for (index, side) in sides.enumerated() where !self.snapshots[index].ended {
                await side.setEnabled(enabled)
            }
        }
        switching = operation
        await operation.value
    }

    public func stop() async {

        if let stopping { await stopping.value; return }
        guard !ended else { return }
        let sides = sides
        let operation = Task {
            await withTaskGroup(of: Void.self) { group in
                for side in sides { group.addTask { await side.stop() } }
            }
            for listener in self.listeners { await listener.value }
            self.finish()
        }
        stopping = operation
        await operation.value
    }

    private func receive(_ snapshot: SideState, on index: Int) {

        guard !ended else { return }
        snapshots[index] = snapshot
        publish()
    }

    private func sideEnded(on index: Int) {

        endedSides[index] = true
        if stopping == nil, endedSides.allSatisfy({ $0 }) { finish() }
        else { publish() }
    }

    private func finish() {

        guard !ended else { return }
        ended = true
        publish()
        continuation.finish()
    }

    private func publish() {

        if let failure = snapshots.compactMap({ snapshot -> String? in
            if case let .failed(message) = snapshot.status { return message }
            return nil
        }).first {
            state.status = .failed(failure)
        } else if ended {
            state.status = .finished
        } else if !enabled {
            state.status = .off
        } else if snapshots.contains(where: { $0.status == .gettingReady || $0.status == .off }) {
            state.status = .gettingReady
        } else {
            state.status = .listening
        }
        mergeEntries()
        continuation.yield(state)
    }

    private struct Remaining {

        let entry: State.Entry
        let side: Int
        let isFinal: Bool
    }

    private func mergeEntries() {

        var remaining: [Remaining] = []
        for (index, snapshot) in snapshots.enumerated() {
            func include(_ entries: some Sequence<SideState.Entry>, final: Bool) {
                for entry in entries {
                    remaining.append(Remaining(entry: .init(
                        speaker: index == 0 ? .mine : .theirs, text: entry.text, writtenLater: entry.writtenLater
                    ), side: index, isFinal: final))
                }
            }
            include(snapshot.finalEntries.dropFirst(committed[index]), final: true)
            include(snapshot.tailEntries, final: false)
        }
        sort(&remaining)

        // A revisable start can move. Only an immutable segment's end is a
        // lower bound on future text; a side with no finals still knows none.
        let bounds = snapshots.enumerated().compactMap { index, snapshot -> (Double, State.Speaker)? in
            guard !snapshot.ended, !endedSides[index] else { return nil }
            return (snapshot.finalEntries.last?.text.end ?? -.infinity, index == 0 ? .mine : .theirs)
        }
        let newlyFinal = remaining.prefix { item in
            item.isFinal && bounds.allSatisfy { start, speaker in
                item.entry.text.start < start || (item.entry.text.start == start
                    && (item.entry.speaker == .mine || speaker == .theirs))
            }
        }
        for item in newlyFinal { committed[item.side] += 1 }
        // One array mutation preserves the prefix in place when unshared,
        // or copies it once when a buffered/retained state still owns it.
        state.entries.replaceSubrange(state.finalCount..., with: remaining.lazy.map(\.entry))
        state.finalCount += newlyFinal.count
    }

    private static func precedes(_ lhs: State.Entry, _ rhs: State.Entry) -> Bool {

        if lhs.text.start != rhs.text.start { return lhs.text.start < rhs.text.start }
        return lhs.speaker == .mine && rhs.speaker == .theirs
    }

    private func sort(_ entries: inout [Remaining]) {

        for item in entries { sortedEntry(item.entry) }
        entries.sort { Self.precedes($0.entry, $1.entry) }
    }

    deinit {

        for listener in listeners { listener.cancel() }
        continuation.finish()
    }
}

private extension SideState {

    /// A side that finished or failed takes no more switches.
    var ended: Bool {
        switch status {
        case .finished, .failed: true
        case .off, .gettingReady, .listening: false
        }
    }
}
