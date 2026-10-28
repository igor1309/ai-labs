import Foundation

@MainActor public final class ClientRadio {
    public enum BluetoothState: Equatable, Sendable {
        case unknown, resetting, unsupported, notAllowed, off, on
    }

    public enum Failure: Error, Equatable, Sendable {
        case noService
        case missingCharacteristic
        case notificationsDisabled
        case unavailableHost
        case notConnected
        case tooLarge(maximum: Int)
        case bluetooth(BluetoothState)
        case att(code: Int)
        case transport(code: Int)
        case disconnected
    }

    public enum WriteTarget: Equatable, Sendable { case key, message }
    public typealias WriteResult = Result<Void, Failure>

    public enum Event: Equatable, Sendable {
        case bluetooth(BluetoothState)
        case reading(host: UUID, name: String?, rssi: Int, time: Double)
        case connected(host: UUID, session: [UInt8], largestWrite: Int)
        case couldNotConnect(host: UUID, reason: Failure)
        case writeAnswered(WriteTarget, Failure?)
        case message(host: UUID, bytes: [UInt8])
        case dropped(host: UUID)
    }

    /// One consumer receives callbacks and write answers in their main-actor order.
    public let events: AsyncStream<Event>
    private let continuation: AsyncStream<Event>.Continuation
    private let binding: any RadioBinding
    private let now: () -> Double

    /// `now` supplies monotonic seconds from the caller's clock.
    public convenience init(now: @escaping () -> Double) {
        self.init(binding: CoreBluetoothBinding(), now: now)
    }

    internal init(binding: any RadioBinding, now: @escaping () -> Double) {
        (events, continuation) = AsyncStream.makeStream()
        self.binding = binding
        self.now = now
        binding.receive = { [weak self] in self?.receive($0) }
    }

    deinit { continuation.finish() }

    private var scanRequested = false

    public func startScanning() {
        guard !scanRequested else { return }
        scanRequested = true
        binding.scan(service: GATT.service, allowDuplicates: true)
    }

    public func stopScanning() {
        guard scanRequested else { return }
        scanRequested = false
        binding.stopScan()
    }

    private enum Setup { case connecting, service, characteristics, subscription, session, ready }
    private var host: UUID?
    private var setup: Setup?

    private func selectedHost(at stage: Setup? = nil) -> UUID? {
        guard stage == nil || setup == stage else { return nil }
        return host
    }

    /// Opens the chosen host and completes service discovery, subscription and Session reading.
    public func connect(to host: UUID) {
        tearDown()
        self.host = host
        setup = .connecting
        binding.connect(host)
    }

    private struct PendingWrite {
        let target: WriteTarget
        let complete: ((WriteResult) -> Void)?
    }
    private var writes: [PendingWrite] = []

    /// Writes Client key; its response arrives on `events`.
    public func writeKey(_ bytes: [UInt8]) { requestWrite(bytes, target: .key, complete: nil) }

    /// Writes To host and returns its response; the same answer also arrives on `events`.
    public func write(_ bytes: [UInt8]) async -> WriteResult {
        await withCheckedContinuation { result in
            requestWrite(bytes, target: .message, complete: { result.resume(returning: $0) })
        }
    }

    private func requestWrite(_ bytes: [UInt8], target: WriteTarget, complete: ((WriteResult) -> Void)?) {
        guard let host = selectedHost(at: .ready) else {
            continuation.yield(.writeAnswered(target, .notConnected))
            complete?(.failure(.notConnected))
            return
        }
        let maximum = binding.maximumWrite(host)
        guard bytes.count <= maximum else {
            continuation.yield(.writeAnswered(target, .tooLarge(maximum: maximum)))
            complete?(.failure(.tooLarge(maximum: maximum)))
            return
        }
        let characteristic: Characteristic = target == .key ? .key : .toHost
        writes.append(PendingWrite(target: target, complete: complete))
        binding.write(bytes, to: characteristic, host: host)
    }

    public func drop() {
        tearDown()
    }

    private func tearDown(_ reason: Failure? = nil) {
        guard let peer = selectedHost() else { return }
        host = nil
        setup = nil
        continuation.yield(reason.map { .couldNotConnect(host: peer, reason: $0) } ?? .dropped(host: peer))
        let pending = writes
        writes.removeAll()
        for write in pending {
            continuation.yield(.writeAnswered(write.target, .disconnected))
            write.complete?(.failure(.disconnected))
        }
        binding.disconnect(peer)
    }

    private func receive(_ callback: RadioCallback) {
        switch callback {
        case .bluetooth(let state):
            continuation.yield(.bluetooth(state))
            if state == .on {
                if scanRequested { binding.scan(service: GATT.service, allowDuplicates: true) }
            } else {
                if setup == .ready { drop() } else { tearDown(.bluetooth(state)) }
            }
        case .discovery(let host, let name, let rssi) where scanRequested:
            continuation.yield(.reading(host: host, name: name, rssi: rssi, time: now()))
        case .connected(let peer) where peer == selectedHost(at: .connecting):
            setup = .service
            binding.discoverService(peer)
        case .services(let peer, .success(true)) where peer == selectedHost(at: .service):
            setup = .characteristics
            binding.discoverCharacteristics(peer)
        case .characteristics(let peer, .success(let found))
            where peer == selectedHost(at: .characteristics) && found == Set(Characteristic.allCases):
            setup = .subscription
            binding.subscribe(peer)
        case .subscribed(let peer, .success(true)) where peer == selectedHost(at: .subscription):
            setup = .session
            binding.readSession(peer)
        case .value(let peer, .session, .success(let bytes)) where peer == selectedHost(at: .session):
            let largestWrite = binding.maximumWrite(peer)
            setup = .ready
            continuation.yield(.connected(host: peer, session: bytes, largestWrite: largestWrite))
        case .connectionFailed(let peer, let reason) where peer == selectedHost(at: .connecting):
            tearDown(reason)
        case .services(let peer, .failure(let reason)) where peer == selectedHost(at: .service):
            tearDown(reason)
        case .services(let peer, .success(false)) where peer == selectedHost(at: .service):
            tearDown(.noService)
        case .characteristics(let peer, .failure(let reason)) where peer == selectedHost(at: .characteristics):
            tearDown(reason)
        case .characteristics(let peer, .success) where peer == selectedHost(at: .characteristics):
            tearDown(.missingCharacteristic)
        case .subscribed(let peer, .failure(let reason)) where peer == selectedHost(at: .subscription):
            tearDown(reason)
        case .subscribed(let peer, .success(false)) where peer == selectedHost(at: .subscription):
            tearDown(.notificationsDisabled)
        case .value(let peer, .session, .failure(let reason)) where peer == selectedHost(at: .session):
            tearDown(reason)
        case .written(let peer, let characteristic, let error) where peer == selectedHost(at: .ready):
            guard let index = writes.firstIndex(where: {
                ($0.target == .key ? Characteristic.key : .toHost) == characteristic
            }) else { return }
            let write = writes.remove(at: index)
            continuation.yield(.writeAnswered(write.target, error))
            write.complete?(error.map { .failure($0) } ?? .success(()))
        case .value(let peer, .toClient, .success(let bytes)) where peer == selectedHost(at: .ready):
            continuation.yield(.message(host: peer, bytes: bytes))
        case .disconnected(let peer) where peer == selectedHost(),
             .serviceRemoved(let peer) where peer == selectedHost():
            if setup == .ready { drop() } else { tearDown(.disconnected) }
        default: break
        }
    }
}

internal enum GATT {
    static let service = UUID(uuidString: "2B9C41A0-3990-45C8-8334-2A1760EC2EF0")!
}

internal enum Characteristic: String, CaseIterable, Sendable {
    case session = "5AF4FD78-A9BD-4831-9E32-AB7C524B5025"
    case key = "3BE0A31F-A0AD-4BE6-B1F8-FCD73973F34C"
    case toClient = "760B00DB-3591-4F2F-9352-D74A127CB218"
    case toHost = "15B7A4C5-0B45-4B5B-BAC8-08BACE8C7C1B"
}

internal enum RadioCallback {
    case bluetooth(ClientRadio.BluetoothState)
    case discovery(UUID, name: String?, rssi: Int)
    case connected(UUID)
    case connectionFailed(UUID, ClientRadio.Failure)
    case services(UUID, Result<Bool, ClientRadio.Failure>)
    case characteristics(UUID, Result<Set<Characteristic>, ClientRadio.Failure>)
    case subscribed(UUID, Result<Bool, ClientRadio.Failure>)
    case value(UUID, Characteristic, Result<[UInt8], ClientRadio.Failure>)
    case written(UUID, Characteristic, ClientRadio.Failure?)
    case disconnected(UUID)
    case serviceRemoved(UUID)
}

@MainActor internal protocol RadioBinding: AnyObject {
    var receive: ((RadioCallback) -> Void)? { get set }
    func scan(service: UUID, allowDuplicates: Bool)
    func stopScan()
    func connect(_ host: UUID)
    func discoverService(_ host: UUID)
    func discoverCharacteristics(_ host: UUID)
    func subscribe(_ host: UUID)
    func readSession(_ host: UUID)
    func maximumWrite(_ host: UUID) -> Int
    func write(_ bytes: [UInt8], to characteristic: Characteristic, host: UUID)
    func disconnect(_ host: UUID)
}
