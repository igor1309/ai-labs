import Foundation

internal enum WriteCharacteristic: Sendable {
    case clientKey, toHost, unsupported
}

internal enum WriteResponse: Equatable, Sendable {
    case success, notPermitted, invalidOffset
}

internal struct PeripheralWrite {
    let session: UUID?
    let peer: UUID
    let characteristic: WriteCharacteristic
    let bytes: [UInt8]
    let offset: Int
}

internal enum PeripheralEvent {
    case state(HostRadio.BluetoothState)
    case added(UUID, HostRadio.Failure?)
    case advertised(UUID, HostRadio.Failure?)
    case subscribed(UUID, peer: UUID, maximum: Int)
    case unsubscribed(UUID, peer: UUID)
    case writes(UUID, [PeripheralWrite])
    case ready

    static func write(_ session: UUID, request: UUID, peer: UUID, characteristic: WriteCharacteristic, bytes: [UInt8], offset: Int) -> Self {
        .writes(request, [.init(session: session, peer: peer, characteristic: characteristic, bytes: bytes, offset: offset)])
    }
}

@MainActor internal protocol PeripheralBinding: AnyObject {
    var receive: (@MainActor (PeripheralEvent) -> Void)? { get set }
    func addService(_ session: UUID, bytes: [UInt8])
    func removeService(_ session: UUID)
    func advertise(_ name: String, session: UUID)
    func stopAdvertising()
    func update(_ bytes: [UInt8], session: UUID, peer: UUID) -> Bool
    func respond(_ request: UUID, with response: WriteResponse)
}
