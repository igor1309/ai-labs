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
    }

    var receive: (@MainActor (PeripheralEvent) -> Void)?
    private var manager: CBPeripheralManager!
    private var services: [UUID: Service] = [:]
    private var serviceHandles: [ObjectIdentifier: UUID] = [:]
    private var centrals: [UUID: CBCentral] = [:]
    private var requests: [UUID: CBATTRequest] = [:]

    override init() {
        super.init()
        manager = CBPeripheralManager(delegate: self, queue: .main)
    }

    func addService(_ handle: UUID, bytes: [UInt8]) {
        let value = CBMutableService(type: Self.serviceUUID, primary: true)
        let toClient = CBMutableCharacteristic(type: Self.toClientUUID, properties: .notify, value: nil, permissions: .readable)
        value.characteristics = [
            CBMutableCharacteristic(type: Self.sessionUUID, properties: .read, value: Data(bytes), permissions: .readable),
            CBMutableCharacteristic(type: Self.keyUUID, properties: .write, value: nil, permissions: .writeable),
            toClient,
            CBMutableCharacteristic(type: Self.toHostUUID, properties: .write, value: nil, permissions: .writeable),
        ]
        services[handle] = Service(value: value, toClient: toClient)
        serviceHandles[ObjectIdentifier(value)] = handle
        manager.add(value)
    }

    func removeService(_ handle: UUID) {
        guard let service = services[handle] else { return }
        manager.remove(service.value)
    }

    func releaseService(_ handle: UUID) {
        guard let service = services.removeValue(forKey: handle) else { return }
        serviceHandles.removeValue(forKey: ObjectIdentifier(service.value))
    }

    func releaseCentral(_ peer: UUID) { centrals.removeValue(forKey: peer) }

    func advertise(_ name: String) {
        manager.startAdvertising([CBAdvertisementDataServiceUUIDsKey: [Self.serviceUUID], CBAdvertisementDataLocalNameKey: name])
    }

    func stopAdvertising() { manager.stopAdvertising() }

    func update(_ bytes: [UInt8], service handle: UUID, peer: UUID) -> Bool {
        guard let service = services[handle], let central = centrals[peer] else { return false }
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
        receive?(.added(serviceHandles[ObjectIdentifier(service)], error.map(failure)))
    }

    func peripheralManagerDidStartAdvertising(_ peripheral: CBPeripheralManager, error: (any Error)?) {
        receive?(.advertised(error.map(failure)))
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didSubscribeTo characteristic: CBCharacteristic) {
        centrals[central.identifier] = central
        receive?(.subscribed(handle(of: characteristic), peer: central.identifier, maximum: central.maximumUpdateValueLength, characteristic: kind(of: characteristic)))
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didUnsubscribeFrom characteristic: CBCharacteristic) {
        centrals[central.identifier] = central
        receive?(.unsubscribed(handle(of: characteristic), peer: central.identifier, characteristic: kind(of: characteristic)))
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
        guard let first = requests.first else { return }
        let id = UUID()
        self.requests[id] = first
        receive?(.writes(id, requests.map { request in
            centrals[request.central.identifier] = request.central
            return PeripheralWrite(
                service: handle(of: request.characteristic), peer: request.central.identifier,
                characteristic: kind(of: request.characteristic), bytes: request.value.map { Array($0) } ?? [], offset: request.offset
            )
        }))
    }

    func peripheralManagerIsReady(toUpdateSubscribers peripheral: CBPeripheralManager) { receive?(.ready) }

    private func handle(of characteristic: CBCharacteristic) -> UUID? {
        characteristic.service.flatMap { serviceHandles[ObjectIdentifier($0)] }
    }

    private func kind(of characteristic: CBCharacteristic) -> PeripheralCharacteristic {
        switch characteristic.uuid {
        case Self.keyUUID: .clientKey
        case Self.toHostUUID: .toHost
        case Self.toClientUUID: .toClient
        default: .unsupported
        }
    }

    private func failure(_ error: any Error) -> HostRadio.Failure {
        let value = error as NSError
        return .system(domain: value.domain, code: value.code, message: value.localizedDescription)
    }
}
