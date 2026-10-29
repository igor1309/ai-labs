import ClientRadio
import HostRadio
import Root
import SystemClock
import Foundation

@MainActor public func deviceRadios() -> RadioPair {
    let clock = SystemClock()
    return RadioPair(host: DeviceHost(HostRadio()), client: DeviceClient(ClientRadio(now: { clock.now() })))
}

@MainActor private final class DeviceHost: HostRadioPort {
    private let radio: HostRadio
    let events: AsyncStream<HostRadioEvent>
    private let eventTask: Task<Void, Never>

    init(_ radio: HostRadio) {
        self.radio = radio
        let (stream, continuation) = AsyncStream<HostRadioEvent>.makeStream()
        events = stream
        let source = radio.events
        eventTask = Task.immediate {
            defer { continuation.finish() }
            for await event in source { continuation.yield(event.rootEvent) }
        }
        let task = eventTask
        continuation.onTermination = { _ in task.cancel() }
    }
    deinit { eventTask.cancel() }

    func serve(_ bytes: [UInt8], for session: UUID) async { await radio.serve(bytes, for: session) }
    func advertise(_ name: String, for session: UUID) { radio.advertise(name, for: session) }
    func stopAdvertising(for session: UUID) { radio.stopAdvertising(for: session) }
    func retire(_ session: UUID) { radio.retire(session) }
    func finish(_ session: UUID) { radio.finish(session) }
    func send(_ bytes: [UInt8], for session: UUID) throws(HostRadioFailure) {
        do { try radio.send(bytes, for: session) } catch { throw error.rootFailure }
    }
}

@MainActor private final class DeviceClient: ClientRadioPort {
    private let radio: ClientRadio
    let events: AsyncStream<ClientRadioEvent>
    private let eventTask: Task<Void, Never>

    init(_ radio: ClientRadio) {
        self.radio = radio
        let (stream, continuation) = AsyncStream<ClientRadioEvent>.makeStream()
        events = stream
        let source = radio.events
        eventTask = Task.immediate {
            defer { continuation.finish() }
            for await event in source { continuation.yield(event.rootEvent) }
        }
        let task = eventTask
        continuation.onTermination = { _ in task.cancel() }
    }
    deinit { eventTask.cancel() }

    func startScanning() { radio.startScanning() }
    func stopScanning() { radio.stopScanning() }
    func connect(to host: UUID) { radio.connect(to: host) }
    func writeKey(_ bytes: [UInt8]) { radio.writeKey(bytes) }
    func write(_ bytes: [UInt8]) async -> ClientWriteResult { await radio.write(bytes).mapError(\.rootFailure) }
    func drop() { radio.drop() }
}

private extension HostRadio.BluetoothState {
    var rootState: HostBluetoothState {
        switch self {
        case .unknown: .unknown
        case .resetting: .resetting
        case .unsupported: .unsupported
        case .unauthorized: .unauthorized
        case .poweredOff: .poweredOff
        case .poweredOn: .poweredOn
        }
    }
}

private extension HostRadio.Failure {
    var rootFailure: HostRadioFailure {
        switch self {
        case .system(let domain, let code, let message): .system(domain: domain, code: code, message: message)
        case .messageTooLarge(let maximum, let actual): .messageTooLarge(maximum: maximum, actual: actual)
        }
    }
}

private extension HostRadio.Event {
    var rootEvent: HostRadioEvent {
        switch self {
        case .bluetoothState(let state): .bluetoothState(state.rootState)
        case .onAir(let session): .onAir(session: session)
        case .couldNotGoOnAir(let session, let failure): .couldNotGoOnAir(session: session, failure.rootFailure)
        case .clientKey(let session, let peer, let bytes): .clientKey(session: session, peer: peer, bytes: bytes)
        case .decision(let session, let bytes): .decision(session: session, bytes: bytes)
        case .clientLost(let session): .clientLost(session: session)
        }
    }
}

private extension ClientRadio.BluetoothState {
    var rootState: ClientBluetoothState {
        switch self {
        case .unknown: .unknown
        case .resetting: .resetting
        case .unsupported: .unsupported
        case .notAllowed: .notAllowed
        case .off: .off
        case .on: .on
        }
    }
}

private extension ClientRadio.Failure {
    var rootFailure: ClientRadioFailure {
        switch self {
        case .noService: .noService
        case .missingCharacteristic: .missingCharacteristic
        case .notificationsDisabled: .notificationsDisabled
        case .unavailableHost: .unavailableHost
        case .notConnected: .notConnected
        case .tooLarge(let maximum): .tooLarge(maximum: maximum)
        case .bluetooth(let state): .bluetooth(state.rootState)
        case .att(let code): .att(code: code)
        case .transport(let code): .transport(code: code)
        case .disconnected: .disconnected
        }
    }
}

private extension ClientRadio.WriteTarget {
    var rootTarget: ClientWriteTarget {
        switch self {
        case .key: .key
        case .message: .message
        }
    }
}

private extension ClientRadio.Event {
    var rootEvent: ClientRadioEvent {
        switch self {
        case .bluetooth(let state): .bluetooth(state.rootState)
        case .reading(let host, let name, let rssi, let time): .reading(host: host, name: name, rssi: rssi, time: time)
        case .connected(let host, let session, let largestWrite): .connected(host: host, session: session, largestWrite: largestWrite)
        case .couldNotConnect(let host, let reason): .couldNotConnect(host: host, reason: reason.rootFailure)
        case .writeAnswered(let target, let failure): .writeAnswered(target.rootTarget, failure?.rootFailure)
        case .message(let host, let bytes): .message(host: host, bytes: bytes)
        case .dropped(let host): .dropped(host: host)
        }
    }
}
