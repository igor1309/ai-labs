import IMRxObservation
import Observation
import Recording
import Testing

struct RecordingRig {

    let session: FakeRecordingSession
    let recording: TestRecording

    init(automatic: Bool, missing: Set<RecordingCondition> = []) async {

        session = FakeRecordingSession()
        recording = await TestRecording(initial: RecordingState(automatic: automatic, missing: missing), session: session)
    }

    func waitFor(_ predicate: (RecordingState) -> Bool) async throws -> RecordingState {

        for await state in await recording.states() {
            if predicate(state) { return state }
        }
        throw CancellationError()
    }

    func start(_ origin: RecordingState.Origin, ready: Bool = true, id: UInt64 = 1) async throws {

        await recording.send(origin == .call ? .callStarted : .userStart)
        try await session.waitFor(.begin(id))
        if ready {
            await session.comeUp(id)
            _ = try await waitFor { $0.phase == .recording && $0.session?.id == id }
        } else {
            #expect(await recording.snapshot().phase == .beginning)
        }
    }

    func stop(_ event: RecordingEvent = .userStop, id: UInt64 = 1) async throws {

        await recording.send(event)
        try await session.waitFor(.end(id))
        #expect(await recording.snapshot().phase == .ending)
    }

    func finish(_ id: UInt64 = 1) async throws -> RecordingState {

        await session.finish(id)
        return try await waitFor { $0.phase == .idle }
    }
}

func withRecording(
    automatic: Bool = true,
    missing: Set<RecordingCondition> = [],
    _ body: (RecordingRig) async throws -> Void
) async throws {

    let rig = await RecordingRig(automatic: automatic, missing: missing)
    await rig.session.observe(rig.recording)
    do {
        try await body(rig)
    } catch {
        await rig.session.close()
        await rig.recording.end()
        throw error
    }
    await rig.session.close()
    await rig.recording.end()
}

/// Recording as the app composes it: the sync model on the main actor and the doer following it.
@MainActor
final class TestRecording {

    private let model: SyncModel<RecordingState, RecordingEvent>
    private var doer: RecordingDoer?
    private var acting: Task<Void, Never>?
    private var delivered: [RecordingEvent] = []
    private var deliveries: [AsyncStream<[RecordingEvent]>.Continuation] = []

    init(initial: RecordingState, session: any RecordingSession) {

        model = SyncModel(initialState: initial, reduce: { RecordingReducer.reduce($0, $1) })
        let doer = RecordingDoer(session: session, callAudioReady: { [weak self] in await self?.snapshot().missing.contains(.callAudioAccess) == false }, callAudioReleased: {}, send: { [weak self] in await self?.deliver($0) })
        self.doer = doer
        let states = states()
        acting = Task { for await state in states { doer.act(on: state) } }
    }

    func send(_ event: RecordingEvent) { model.event(event) }

    func snapshot() -> RecordingState { model.state }

    func states() -> AsyncStream<RecordingState> {

        let observed = Observations { [model] in model.state }
        return AsyncStream { continuation in
            let task = Task {
                for await state in observed { continuation.yield(state) }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    /// Returns once the doer has sent `event` back.
    func waitForDelivery(of event: RecordingEvent) async {

        let (stream, continuation) = AsyncStream<[RecordingEvent]>.makeStream()
        continuation.yield(delivered)
        deliveries.append(continuation)
        for await events in stream where events.contains(event) { return }
    }

    func end() {

        acting?.cancel()
        for delivery in deliveries { delivery.finish() }
    }

    private func deliver(_ event: RecordingEvent) {

        model.event(event)
        delivered.append(event)
        for delivery in deliveries { delivery.yield(delivered) }
    }
}

actor FakeRecordingSession: RecordingSession {

    enum Entry: Equatable, Sendable {

        case begin(UInt64)
        case end(UInt64)
    }

    private var entries: [Entry] = []
    private var beginnings: [UInt64: (AsyncStream<RecordingSessionReport>, AsyncStream<RecordingSessionReport>.Continuation)] = [:]
    private var endings: [UInt64: (AsyncStream<Void>, AsyncStream<Void>.Continuation)] = [:]
    private var observers: [UInt64: AsyncStream<[Entry]>.Continuation] = [:]
    private var nextObserver: UInt64 = 0
    private var up: Set<UInt64> = []
    private var closed = false
    private weak var recording: TestRecording?
    private var liveText = false

    func observe(_ recording: TestRecording) { self.recording = recording }

    func begin(id: UInt64) async -> RecordingSessionReport {

        let stream = beginning(id)
        append(.begin(id))
        var iterator = stream.makeAsyncIterator()
        return await iterator.next() ?? .ended
    }

    func end(id: UInt64) async {

        let stream = ending(id)
        append(.end(id))
        var iterator = stream.makeAsyncIterator()
        _ = await iterator.next()
    }

    func comeUp(_ id: UInt64) {

        _ = beginning(id)
        up.insert(id)
        beginnings[id]?.1.yield(.ready)
    }

    func fail(_ id: UInt64, reason: String) async {

        if up.contains(id) {
            await recording?.send(.sessionReported(id: id, .cannotRecord(reason)))
        } else {
            _ = beginning(id)
            beginnings[id]?.1.yield(.cannotRecord(reason))
        }
    }

    func switchLiveText(_ enabled: Bool) { liveText = enabled }

    func finish(_ id: UInt64) {

        _ = ending(id)
        endings[id]?.1.yield(())
    }

    func values() -> [Entry] { entries }

    func waitFor(_ entry: Entry) async throws {

        let id = nextObserver
        nextObserver += 1
        let (stream, continuation) = AsyncStream<[Entry]>.makeStream()
        continuation.yield(entries)
        if closed { continuation.finish() }
        else { observers[id] = continuation }
        defer { observers.removeValue(forKey: id)?.finish() }
        for await entries in stream {
            if entries.contains(entry) { return }
        }
        throw CancellationError()
    }

    func close() {

        closed = true
        for channel in beginnings.values { channel.1.finish() }
        for channel in endings.values { channel.1.finish() }
        for observer in observers.values { observer.finish() }
        observers.removeAll()
    }

    private func append(_ entry: Entry) {

        entries.append(entry)
        for observer in observers.values { observer.yield(entries) }
    }

    private func beginning(_ id: UInt64) -> AsyncStream<RecordingSessionReport> {

        if let channel = beginnings[id] { return channel.0 }
        let channel = AsyncStream<RecordingSessionReport>.makeStream()
        if closed { channel.continuation.finish() }
        beginnings[id] = channel
        return channel.stream
    }

    private func ending(_ id: UInt64) -> AsyncStream<Void> {

        if let channel = endings[id] { return channel.0 }
        let channel = AsyncStream<Void>.makeStream()
        if closed { channel.continuation.finish() }
        endings[id] = channel
        return channel.stream
    }
}
