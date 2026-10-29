/// Combines two sides' text, marking whose it is and switching them together.
/// A side whose text fails leaves the other side going.
public actor CallText {

    public nonisolated let updates: AsyncStream<State>
    public private(set) var state = State(status: .off, entries: [])

    private let continuation: AsyncStream<State>.Continuation
    private let sides: [any Side]
    private var snapshots = [SideState](repeating: .init(status: .off, entries: []), count: 2)
    private var listeners: [Task<Void, Never>] = []
    private var endedSides = [false, false]
    private var stopping: Task<Void, Never>?
    private var switching: Task<Void, Never>?
    private var started = false
    private var enabled = false
    private var ended = false

    public init(microphone: any Side, call: any Side) {

        sides = [microphone, call]
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
            .init(status: snapshot.ended ? snapshot.status : (enabled ? .gettingReady : .off), entries: snapshot.entries)
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
        state.entries = snapshots.enumerated().flatMap { index, snapshot in
            snapshot.entries.map { entry in
                State.Entry(speaker: index == 0 ? .mine : .theirs, text: entry.text, writtenLater: entry.writtenLater)
            }
        }.sorted {
            if $0.text.start != $1.text.start { return $0.text.start < $1.text.start }
            return $0.speaker == .mine && $1.speaker == .theirs
        }
        continuation.yield(state)
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
