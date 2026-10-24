@testable import Machine
import Recording
import Testing

struct RecordingRig {

    let session: FakeRecordingSession
    let recording: Recording

    init(automatic: Bool, missing: Set<RecordingCondition> = []) {

        session = FakeRecordingSession()
        recording = Recording(
            handler: RecordingEffectHandler(session: session),
            initial: RecordingState(automatic: automatic, missing: missing)
        )
    }

    func waitFor(_ predicate: (RecordingState) -> Bool) async throws -> RecordingState {

        for await state in await recording.states() {
            if predicate(state) { return state }
        }
        throw CancellationError()
    }

    func start(_ origin: RecordingState.Origin, ready: Bool = true, id: UInt64 = 1) async throws {

        recording.send(origin == .call ? .callStarted : .userStart)
        try await session.waitFor(.begin(id))
        if ready {
            await session.comeUp(id)
            _ = try await waitFor { $0.phase == .recording && $0.session?.id == id }
        } else {
            #expect(await recording.snapshot().phase == .beginning)
        }
    }

    func stop(_ event: RecordingEvent = .userStop, id: UInt64 = 1) async throws {

        recording.send(event)
        try await session.waitFor(.end(id))
        #expect(await recording.snapshot().phase == .ending)
    }

    func finish(_ id: UInt64 = 1) async throws -> RecordingState {

        await session.finish(id)
        return try await waitFor { $0.phase == .idle }
    }

    func settleEffects() async {

        await withTaskCancellationHandler {
            await recording.machine.waitForEffects()
        } onCancel: {
            Task { await session.close() }
        }
    }
}

func withRecording(
    automatic: Bool = true,
    missing: Set<RecordingCondition> = [],
    _ body: (RecordingRig) async throws -> Void
) async throws {

    let rig = RecordingRig(automatic: automatic, missing: missing)
    await rig.session.observe(rig.recording)
    do {
        try await body(rig)
    } catch {
        await rig.session.close()
        await rig.recording.end()
        await rig.recording.machine.waitForEffects()
        throw error
    }
    await rig.session.close()
    await rig.recording.end()
    await rig.recording.machine.waitForEffects()
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
    private weak var recording: Recording?
    private var liveText = false

    func observe(_ recording: Recording) { self.recording = recording }

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

    func fail(_ id: UInt64, reason: String) {

        if up.contains(id) {
            recording?.send(.sessionReported(id: id, .cannotRecord(reason)))
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
