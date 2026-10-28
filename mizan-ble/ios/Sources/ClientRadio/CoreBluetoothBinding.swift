import CoreBluetooth
import Foundation

@MainActor internal final class CoreBluetoothBinding: NSObject, RadioBinding,
    @preconcurrency CBCentralManagerDelegate, @preconcurrency CBPeripheralDelegate {
    var receive: ((RadioCallback) -> Void)?
    private var central: CBCentralManager!
    private var peers: [UUID: CBPeripheral] = [:]

    override init() {
        super.init()
        // Delegate callbacks share the adapter's main-actor ordering.
        central = CBCentralManager(delegate: self, queue: .main)
    }

    func scan(service: UUID, allowDuplicates: Bool) {
        central.scanForPeripherals(
            withServices: [CBUUID(nsuuid: service)],
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: allowDuplicates]
        )
    }

    func stopScan() { central.stopScan() }

    func connect(_ host: UUID) {
        guard let peer = peers[host] ?? central.retrievePeripherals(withIdentifiers: [host]).first else {
            receive?(.connectionFailed(host, .unavailableHost))
            return
        }
        peers[host] = peer
        peer.delegate = self
        central.connect(peer)
    }

    func discoverService(_ host: UUID) {
        peers[host]?.discoverServices([CBUUID(nsuuid: GATT.service)])
    }

    func discoverCharacteristics(_ host: UUID) {
        guard let peer = peers[host], let service = service(on: peer) else {
            receive?(.characteristics(host, .failure(.noService)))
            return
        }
        peer.discoverCharacteristics(Characteristic.allCases.map { CBUUID(string: $0.rawValue) }, for: service)
    }

    func subscribe(_ host: UUID) {
        guard let peer = peers[host], let characteristic = characteristic(.toClient, on: peer) else {
            receive?(.subscribed(host, .failure(.missingCharacteristic)))
            return
        }
        peer.setNotifyValue(true, for: characteristic)
    }

    func readSession(_ host: UUID) {
        guard let peer = peers[host], let characteristic = characteristic(.session, on: peer) else {
            receive?(.value(host, .session, .failure(.missingCharacteristic)))
            return
        }
        peer.readValue(for: characteristic)
    }

    func maximumWrite(_ host: UUID) -> Int {
        peers[host]?.maximumWriteValueLength(for: .withResponse) ?? 0
    }

    func write(_ bytes: [UInt8], to target: Characteristic, host: UUID) {
        guard let peer = peers[host], let characteristic = characteristic(target, on: peer) else {
            receive?(.written(host, target, .missingCharacteristic))
            return
        }
        peer.writeValue(Data(bytes), for: characteristic, type: .withResponse)
    }

    func disconnect(_ host: UUID) {
        if let peer = peers[host] { central.cancelPeripheralConnection(peer) }
    }

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        let state: ClientRadio.BluetoothState
        switch central.state {
        case .unknown: state = .unknown
        case .resetting: state = .resetting
        case .unsupported: state = .unsupported
        case .unauthorized: state = .notAllowed
        case .poweredOff: state = .off
        case .poweredOn: state = .on
        @unknown default: state = .unknown
        }
        receive?(.bluetooth(state))
    }

    func centralManager(
        _ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any], rssi RSSI: NSNumber
    ) {
        peers[peripheral.identifier] = peripheral
        receive?(.discovery(
            peripheral.identifier, name: advertisementData[CBAdvertisementDataLocalNameKey] as? String,
            rssi: RSSI.intValue
        ))
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        receive?(.connected(peripheral.identifier))
    }

    func centralManager(
        _ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: (any Error)?
    ) {
        receive?(.connectionFailed(peripheral.identifier, failure(error) ?? .transport(code: CBError.unknown.rawValue)))
    }

    func centralManager(
        _ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: (any Error)?
    ) {
        receive?(.disconnected(peripheral.identifier))
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: (any Error)?) {
        let result: Result<Bool, ClientRadio.Failure> = failure(error).map { .failure($0) }
            ?? .success(service(on: peripheral) != nil)
        receive?(.services(peripheral.identifier, result))
    }

    func peripheral(
        _ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: (any Error)?
    ) {
        guard service.uuid == CBUUID(nsuuid: GATT.service) else { return }
        let found = Set((service.characteristics ?? []).compactMap { Characteristic(rawValue: $0.uuid.uuidString) })
        let result: Result<Set<Characteristic>, ClientRadio.Failure> = failure(error).map { .failure($0) }
            ?? .success(found)
        receive?(.characteristics(peripheral.identifier, result))
    }

    func peripheral(
        _ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic,
        error: (any Error)?
    ) {
        guard characteristic.uuid == CBUUID(string: Characteristic.toClient.rawValue) else { return }
        let result: Result<Bool, ClientRadio.Failure> = failure(error).map { .failure($0) }
            ?? .success(characteristic.isNotifying)
        receive?(.subscribed(peripheral.identifier, result))
    }

    func peripheral(
        _ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: (any Error)?
    ) {
        guard let target = Characteristic(rawValue: characteristic.uuid.uuidString) else { return }
        let result: Result<[UInt8], ClientRadio.Failure> = failure(error).map { .failure($0) }
            ?? .success(Array(characteristic.value ?? Data()))
        receive?(.value(peripheral.identifier, target, result))
    }

    func peripheral(
        _ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: (any Error)?
    ) {
        guard let target = Characteristic(rawValue: characteristic.uuid.uuidString) else { return }
        receive?(.written(peripheral.identifier, target, failure(error)))
    }

    func peripheral(_ peripheral: CBPeripheral, didModifyServices invalidatedServices: [CBService]) {
        if invalidatedServices.contains(where: { $0.uuid == CBUUID(nsuuid: GATT.service) }) {
            receive?(.serviceRemoved(peripheral.identifier))
        }
    }

    private func service(on peer: CBPeripheral) -> CBService? {
        peer.services?.first { $0.uuid == CBUUID(nsuuid: GATT.service) }
    }

    private func characteristic(_ target: Characteristic, on peer: CBPeripheral) -> CBCharacteristic? {
        service(on: peer)?.characteristics?.first { $0.uuid == CBUUID(string: target.rawValue) }
    }

    private func failure(_ error: (any Error)?) -> ClientRadio.Failure? {
        guard let error = error as NSError? else { return nil }
        return error.domain == CBATTErrorDomain ? .att(code: error.code) : .transport(code: error.code)
    }
}
