import CoreBluetooth
import Foundation

// The manager delivers its delegate calls on the main queue, preserving their order.
@MainActor internal final class CoreBluetoothPeripheral: NSObject, PeripheralBinding, @preconcurrency CBPeripheralManagerDelegate {
    private static let serviceUUID = CBUUID(string: "2B9C41A0-3990-45C8-8334-2A1760EC2EF0")
    private static let sessionUUID = CBUUID(string: "5AF4FD78-A9BD-4831-9E32-AB7C524B5025")
    private static let keyUUID = CBUUID(string: "3BE0A31F-A0AD-4BE6-B1F8-FCD73973F34C")
    private static let toClientUUID = CBUUID(string: "760B00DB-3591-4F2F-9352-D74A127CB218")
    private static let toHostUUID = CBUUID(string: "15B7A4C5-0B45-4B5B-BAC8-08BACE8C7C1B")

    private struct Service {
        let value: CBMutableService
        let toClient: CBMutableCharacteristic
        var adding = true
        var centrals: [UUID: CBCentral] = [:]
    }

    var receive: (@MainActor (PeripheralEvent) -> Void)?
    private var manager: CBPeripheralManager!
    private var services: [UUID: Service] = [:]
    private var sessionIDs: [ObjectIdentifier: UUID] = [:]
    private var advertisements: [UUID] = []
    private var requests: [UUID: CBATTRequest] = [:]

    override init() {
        super.init()
        manager = CBPeripheralManager(delegate: self, queue: .main)
    }

    func addService(_ session: UUID, bytes: [UInt8]) {
        let value = CBMutableService(type: Self.serviceUUID, primary: true)
        let toClient = CBMutableCharacteristic(type: Self.toClientUUID, properties: .notify, value: nil, permissions: .readable)
        value.characteristics = [
            CBMutableCharacteristic(type: Self.sessionUUID, properties: .read, value: Data(bytes), permissions: .readable),
            CBMutableCharacteristic(type: Self.keyUUID, properties: .write, value: nil, permissions: .writeable),
            toClient,
            CBMutableCharacteristic(type: Self.toHostUUID, properties: .write, value: nil, permissions: .writeable),
        ]
        services[session] = Service(value: value, toClient: toClient)
        sessionIDs[ObjectIdentifier(value)] = session
        manager.add(value)
    }

    func removeService(_ session: UUID) {
        guard let service = services[session] else { return }
        manager.remove(service.value)
        // An add already submitted can still complete after removal; retain its identity
        // until the callback so the adapter can remove that late service too.
        if !service.adding {
            services.removeValue(forKey: session)
            sessionIDs.removeValue(forKey: ObjectIdentifier(service.value))
        }
    }

    func advertise(_ name: String, session: UUID) {
        advertisements.append(session)
        manager.startAdvertising([CBAdvertisementDataServiceUUIDsKey: [Self.serviceUUID], CBAdvertisementDataLocalNameKey: name])
    }

    func stopAdvertising() { manager.stopAdvertising() }

    func update(_ bytes: [UInt8], session: UUID, peer: UUID) -> Bool {
        guard let service = services[session], let central = service.centrals[peer] else { return false }
        return manager.updateValue(Data(bytes), for: service.toClient, onSubscribedCentrals: [central])
    }

    func respond(_ request: UUID, with response: WriteResponse) {
        guard let value = requests.removeValue(forKey: request) else { return }
        let result: CBATTError.Code = switch response {
        case .success: .success
        case .notPermitted: .writeNotPermitted
        case .invalidOffset: .invalidOffset
        }
        manager.respond(to: value, withResult: result)
    }

    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        let state: HostRadio.BluetoothState = switch peripheral.state {
        case .unknown: .unknown
        case .resetting: .resetting
        case .unsupported: .unsupported
        case .unauthorized: .unauthorized
        case .poweredOff: .poweredOff
        case .poweredOn: .poweredOn
        @unknown default: .unknown
        }
        receive?(.state(state))
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, didAdd service: CBService, error: (any Error)?) {
        guard let session = sessionIDs[ObjectIdentifier(service)] else { return }
        services[session]?.adding = false
        receive?(.added(session, error.map(failure)))
    }

    func peripheralManagerDidStartAdvertising(_ peripheral: CBPeripheralManager, error: (any Error)?) {
        guard !advertisements.isEmpty else { return }
        receive?(.advertised(advertisements.removeFirst(), error.map(failure)))
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didSubscribeTo characteristic: CBCharacteristic) {
        guard characteristic.uuid == Self.toClientUUID, let session = session(of: characteristic) else { return }
        services[session]?.centrals[central.identifier] = central
        receive?(.subscribed(session, peer: central.identifier, maximum: central.maximumUpdateValueLength))
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didUnsubscribeFrom characteristic: CBCharacteristic) {
        guard characteristic.uuid == Self.toClientUUID, let session = session(of: characteristic) else { return }
        services[session]?.centrals.removeValue(forKey: central.identifier)
        receive?(.unsubscribed(session, peer: central.identifier))
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
        guard let first = requests.first else { return }
        let id = UUID()
        self.requests[id] = first
        receive?(.writes(id, requests.map { request in
            let characteristic: WriteCharacteristic = switch request.characteristic.uuid {
            case Self.keyUUID: .clientKey
            case Self.toHostUUID: .toHost
            default: .unsupported
            }
            return PeripheralWrite(
                session: session(of: request.characteristic), peer: request.central.identifier,
                characteristic: characteristic, bytes: request.value.map { Array($0) } ?? [], offset: request.offset
            )
        }))
    }

    func peripheralManagerIsReady(toUpdateSubscribers peripheral: CBPeripheralManager) { receive?(.ready) }

    private func session(of characteristic: CBCharacteristic) -> UUID? {
        characteristic.service.flatMap { sessionIDs[ObjectIdentifier($0)] }
    }

    private func failure(_ error: any Error) -> HostRadio.Failure {
        let value = error as NSError
        return .system(domain: value.domain, code: value.code, message: value.localizedDescription)
    }
}
