/// Combines two sides' text, marking whose it is and switching them together.
public actor CallText {

    public nonisolated let updates: AsyncStream<State>
    public private(set) var state = State(status: .off, entries: [])

    private let continuation: AsyncStream<State>.Continuation
    private let sides: [any Side]
    private var snapshots = [SideState](repeating: .init(status: .off, entries: []), count: 2)
    private var listeners: [Task<Void, Never>] = []
    private var stopping: Task<Void, Never>?
    private var started = false
    private var enabled = false
    private var ended = false

    public init(microphone: any Side, call: any Side) {

        sides = [microphone, call]
        (updates, continuation) = AsyncStream.makeStream(bufferingPolicy: .bufferingNewest(1))
    }

    public func start(enabled: Bool = true) async {

        guard !started, !ended, stopping == nil else { return }
        started = true
        self.enabled = enabled
        snapshots = sides.map { _ in .init(status: enabled ? .gettingReady : .off, entries: []) }
        listeners = sides.enumerated().map { index, side in
            Task { [weak self] in
                await side.listen { [weak self] snapshot in await self?.receive(snapshot, on: index) }
            }
        }
        publish()
        for side in sides { await side.start(enabled: enabled) }
    }

    public func setEnabled(_ enabled: Bool) async {

        guard started, !ended, stopping == nil, self.enabled != enabled else { return }
        self.enabled = enabled
        snapshots = snapshots.map { snapshot in
            .init(status: snapshot.status == .finished ? .finished : (enabled ? .gettingReady : .off), entries: snapshot.entries)
        }
        publish()
        for side in sides { await side.setEnabled(enabled) }
    }

    public func stop() async {

        if let stopping { await stopping.value; return }
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

    private func receive(_ snapshot: SideState, on index: Int) async {

        guard !ended else { return }
        snapshots[index] = snapshot
        if case .failed = snapshot.status {
            // The other side's audio may remain open after text fails.
            await sides[1 - index].abandon()
            finish()
        } else {
            publish()
            if snapshots.allSatisfy({ $0.status == .finished }) { finish() }
        }
    }

    private func finish() {

        guard !ended else { return }
        ended = true
        publish()
        continuation.finish()
        for listener in listeners { listener.cancel() }
    }

    private func publish() {

        if let failure = snapshots.compactMap({ snapshot -> String? in
            if case let .failed(message) = snapshot.status { return message }
            return nil
        }).first {
            state.status = .failed(failure)
        } else if ended || snapshots.allSatisfy({ $0.status == .finished }) {
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
