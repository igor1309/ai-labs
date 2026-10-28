import Foundation

internal enum PeripheralCharacteristic: Sendable {
    case clientKey, toHost, toClient, unsupported
}

internal enum WriteResponse: Equatable, Sendable {
    case success, notPermitted, invalidOffset
}

internal struct PeripheralWrite {
    let service: UUID?
    let peer: UUID
    let characteristic: PeripheralCharacteristic
    let bytes: [UInt8]
    let offset: Int
}

internal enum PeripheralEvent {
    case state(HostRadio.BluetoothState)
    case added(UUID?, HostRadio.Failure?)
    case advertised(HostRadio.Failure?)
    case subscribed(UUID?, peer: UUID, maximum: Int, characteristic: PeripheralCharacteristic = .toClient)
    case unsubscribed(UUID?, peer: UUID, characteristic: PeripheralCharacteristic = .toClient)
    case writes(UUID, [PeripheralWrite])
    case ready

    static func write(_ service: UUID, request: UUID, peer: UUID, characteristic: PeripheralCharacteristic, bytes: [UInt8], offset: Int) -> Self {
        .writes(request, [.init(service: service, peer: peer, characteristic: characteristic, bytes: bytes, offset: offset)])
    }
}

@MainActor internal protocol PeripheralBinding: AnyObject {
    var receive: (@MainActor (PeripheralEvent) -> Void)? { get set }
    func addService(_ service: UUID, bytes: [UInt8])
    func removeService(_ service: UUID)
    func advertise(_ name: String)
    func releaseService(_ service: UUID)
    func releaseCentral(_ peer: UUID)
    func stopAdvertising()
    func update(_ bytes: [UInt8], service: UUID, peer: UUID) -> Bool
    func respond(_ request: UUID, with response: WriteResponse)
}
