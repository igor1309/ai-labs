import Foundation

@MainActor public final class LoggedHostRadio: HostRadioPort {
    private let base: any HostRadioPort
    private let log: RadioLog
    public let events: AsyncStream<HostRadioEvent>
    private let eventTask: Task<Void, Never>

    public init(_ base: any HostRadioPort, log: any LogSink) {
        self.base = base
        let writer = RadioLog(sink: log, category: .hostRadio)
        self.log = writer
        writer.record("built")
        let (stream, continuation) = AsyncStream<HostRadioEvent>.makeStream()
        events = stream
        let source = base.events
        eventTask = Task.immediate {
            defer { continuation.finish() }
            for await event in source {
                writer.record(event.logDescription)
                continuation.yield(event)
            }
        }
        let task = eventTask
        continuation.onTermination = { _ in task.cancel() }
    }

    deinit { eventTask.cancel() }

    public func serve(_ bytes: [UInt8], for session: UUID) async {
        log.called("serve", count: bytes.count)
        await base.serve(bytes, for: session)
        log.succeeded("serve")
    }
    public func advertise(_ name: String, for session: UUID) {
        log.called("advertise")
        base.advertise(name, for: session)
        log.succeeded("advertise")
    }
    public func stopAdvertising(for session: UUID) {
        log.called("stopAdvertising")
        base.stopAdvertising(for: session)
        log.succeeded("stopAdvertising")
    }
    public func retire(_ session: UUID) {
        log.called("retire")
        base.retire(session)
        log.succeeded("retire")
    }
    public func finish(_ session: UUID) {
        log.called("finish")
        base.finish(session)
        log.succeeded("finish")
    }
    public func send(_ bytes: [UInt8], for session: UUID) throws(HostRadioFailure) {
        log.called("send", count: bytes.count)
        do {
            try base.send(bytes, for: session)
            log.succeeded("send")
        } catch {
            log.failed("send", error: error.logDescription)
            throw error
        }
    }
}

@MainActor public final class LoggedClientRadio: ClientRadioPort {
    private let base: any ClientRadioPort
    private let log: RadioLog
    public let events: AsyncStream<ClientRadioEvent>
    private let eventTask: Task<Void, Never>

    public init(_ base: any ClientRadioPort, log: any LogSink) {
        self.base = base
        let writer = RadioLog(sink: log, category: .clientRadio)
        self.log = writer
        writer.record("built")
        let (stream, continuation) = AsyncStream<ClientRadioEvent>.makeStream()
        events = stream
        let source = base.events
        eventTask = Task.immediate {
            defer { continuation.finish() }
            for await event in source {
                writer.record(event.logDescription)
                continuation.yield(event)
            }
        }
        let task = eventTask
        continuation.onTermination = { _ in task.cancel() }
    }

    deinit { eventTask.cancel() }

    public func startScanning() {
        log.called("startScanning")
        base.startScanning()
        log.succeeded("startScanning")
    }
    public func stopScanning() {
        log.called("stopScanning")
        base.stopScanning()
        log.succeeded("stopScanning")
    }
    public func connect(to host: UUID) {
        log.called("connect")
        base.connect(to: host)
        log.succeeded("connect")
    }
    public func writeKey(_ bytes: [UInt8]) {
        log.called("writeKey", count: bytes.count)
        base.writeKey(bytes)
        log.succeeded("writeKey")
    }
    public func write(_ bytes: [UInt8]) async -> ClientWriteResult {
        log.called("write", count: bytes.count)
        let result = await base.write(bytes)
        switch result {
        case .success: log.succeeded("write")
        case .failure(let failure): log.failed("write", error: failure.logDescription)
        }
        return result
    }
    public func drop() {
        log.called("drop")
        base.drop()
        log.succeeded("drop")
    }
}

private struct RadioLog: Sendable {
    let sink: any LogSink
    let category: LogEntry.Category

    func record(_ message: String, error: String? = nil) {
        sink.write(.init(category: category, message: message, error: error))
    }
    func called(_ name: String, count: Int? = nil) {
        record("\(name) called" + (count.map { " bytes=\($0)" } ?? ""))
    }
    func succeeded(_ name: String) { record("\(name) succeeded") }
    func failed(_ name: String, error: String) { record("\(name) failed", error: error) }
}
