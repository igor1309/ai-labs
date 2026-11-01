import Foundation

@MainActor public protocol HostRadioPort: AnyObject {
    var events: AsyncStream<HostRadioEvent> { get }
    func serve(_ bytes: [UInt8], for session: UUID) async
    func advertise(_ name: String, for session: UUID)
    func stopAdvertising(for session: UUID)
    func retire(_ session: UUID)
    func finish(_ session: UUID)
    func send(_ bytes: [UInt8], for session: UUID) throws(HostRadioFailure)
}

public enum HostBluetoothState: Equatable, Sendable {
    case unknown, resetting, unsupported, unauthorized, poweredOff, poweredOn
}

public enum HostRadioFailure: Error, Equatable, Sendable {
    case system(domain: String, code: Int, message: String)
    case messageTooLarge(maximum: Int, actual: Int)
}

public enum HostRadioEvent: Equatable, Sendable {
    case bluetoothState(HostBluetoothState)
    case onAir(session: UUID)
    case couldNotGoOnAir(session: UUID, HostRadioFailure)
    case clientKey(session: UUID, peer: UUID, bytes: [UInt8])
    case decision(session: UUID, bytes: [UInt8])
    case clientLost(session: UUID)
}

@MainActor public protocol ClientRadioPort: AnyObject {
    var events: AsyncStream<ClientRadioEvent> { get }
    func startScanning()
    func stopScanning()
    func connect(to host: UUID)
    func writeKey(_ bytes: [UInt8])
    func write(_ bytes: [UInt8]) async -> ClientWriteResult
    func drop()
}

public enum ClientBluetoothState: Equatable, Sendable {
    case unknown, resetting, unsupported, notAllowed, off, on
}

public enum ClientRadioFailure: Error, Equatable, Sendable {
    case noService, missingCharacteristic, notificationsDisabled, unavailableHost, notConnected
    case tooLarge(maximum: Int)
    case bluetooth(ClientBluetoothState)
    case att(code: Int)
    case transport(code: Int)
    case disconnected
}

public enum ClientWriteTarget: Equatable, Sendable { case key, message }
public typealias ClientWriteResult = Result<Void, ClientRadioFailure>

public enum ClientRadioEvent: Equatable, Sendable {
    case bluetooth(ClientBluetoothState)
    case reading(host: UUID, name: String?, rssi: Int, time: Double)
    case connected(host: UUID, session: [UInt8], largestWrite: Int)
    case couldNotConnect(host: UUID, reason: ClientRadioFailure)
    case writeAnswered(ClientWriteTarget, ClientRadioFailure?)
    case message(host: UUID, bytes: [UInt8])
    case dropped(host: UUID)
}

public struct RadioPair {
    public let host: any HostRadioPort
    public let client: any ClientRadioPort

    public init(host: any HostRadioPort, client: any ClientRadioPort) {
        self.host = host
        self.client = client
    }
}
