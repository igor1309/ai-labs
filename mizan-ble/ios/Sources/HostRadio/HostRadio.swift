import Foundation

@MainActor public final class HostRadio {
    public enum BluetoothState: Equatable, Sendable {
        case unknown, resetting, unsupported, unauthorized, poweredOff, poweredOn
    }

    public enum Failure: Error, Equatable, Sendable {
        case system(domain: String, code: Int, message: String)
        case messageTooLarge(maximum: Int, actual: Int)
    }

    public enum Event: Equatable, Sendable {
        case bluetoothState(BluetoothState)
        case onAir(session: UUID)
        case couldNotGoOnAir(session: UUID, Failure)
        case clientKey(session: UUID, peer: UUID, bytes: [UInt8])
        case decision(session: UUID, bytes: [UInt8])
        case clientLost(session: UUID)
    }

    /// One ordered stream for the root to translate into the host flows.
    public let events: AsyncStream<Event>
    private let continuation: AsyncStream<Event>.Continuation
    private let binding: any PeripheralBinding

    public convenience init() {
        self.init(binding: CoreBluetoothPeripheral())
    }

    internal init(binding: any PeripheralBinding) {
        (events, continuation) = AsyncStream.makeStream()
        self.binding = binding
        binding.receive = { [weak self] in self?.receive($0) }
    }

    deinit { continuation.finish() }

    private struct Service {
        let id: UUID
        let handle: UUID
        var serving: PendingService?
        var added = false
        var advertising: UUID?
        var subscribers: [UUID: Int] = [:]
        var owner: UUID?
        var queue: [[UInt8]] = []
        var finishing = false
        var blocked = false
    }

    // Cancellation can arrive off the main actor, including before the wait is installed.
    private final class PendingService: @unchecked Sendable {
        let id: UUID
        let bytes: [UInt8]
        private let lock = NSLock()
        private var cancelled = false
        private var continuation: CheckedContinuation<Void, Never>?

        init(id: UUID, bytes: [UInt8]) {
            self.id = id
            self.bytes = bytes
        }

        var isCancelled: Bool { lock.withLock { cancelled } }

        func suspend(_ continuation: CheckedContinuation<Void, Never>) -> Bool {
            let waiting = lock.withLock {
                guard !cancelled else { return false }
                self.continuation = continuation
                return true
            }
            if !waiting { continuation.resume() }
            return waiting
        }

        func resume(cancelled: Bool = false) {
            let waiting = lock.withLock {
                self.cancelled = self.cancelled || cancelled
                defer { continuation = nil }
                return continuation
            }
            waiting?.resume()
        }
    }

    private struct Advertisement {
        let id: UUID
        let service: UUID
    }

    private var advertisements: [Advertisement] = []
    private var pendingServices: [PendingService] = []
    private var service: Service?
    private var retired: Set<UUID> = []
    private var additions: Set<UUID> = []

    /// Returns when the service has been added, the session has ended, or the task is cancelled.
    /// Serving failures arrive on `events` with the session they belong to.
    public func serve(_ bytes: [UInt8], for session: UUID) async {
        guard !retired.contains(session) else { return }
        let request = PendingService(id: session, bytes: bytes)
        await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                guard request.suspend(continuation) else { return }
                if service?.finishing == true {
                    pendingServices.append(request)
                } else {
                    if service != nil { removeService() }
                    addService(request)
                }
            }
        } onCancel: {
            request.resume(cancelled: true)
        }
    }

    @discardableResult private func addService(_ request: PendingService) -> Bool {
        guard !request.isCancelled else { return false }
        let handle = UUID()
        service = Service(id: request.id, handle: handle, serving: request)
        additions.insert(handle)
        binding.addService(handle, bytes: request.bytes)
        return true
    }

    public func advertise(_ name: String, for session: UUID) {
        guard service?.id == session, service?.added == true, let handle = service?.handle else { return }
        let request = Advertisement(id: UUID(), service: handle)
        service?.advertising = request.id
        advertisements.append(request)
        binding.advertise(name)
    }

    public func stopAdvertising(for session: UUID) {
        guard service?.id == session, service?.advertising != nil else { return }
        service?.advertising = nil
        binding.stopAdvertising()
    }

    public func retire(_ session: UUID) {
        retired.insert(session)
        let cancelled = pendingServices.filter { $0.id == session }
        pendingServices.removeAll { $0.id == session }
        for request in cancelled { request.resume() }
        guard service?.id == session else { return }
        removeService()
    }

    private func removeService() {
        guard let old = service else { return }
        service = nil
        retired.insert(old.id)
        if old.advertising != nil { binding.stopAdvertising() }
        for peer in old.subscribers.keys { binding.releaseCentral(peer) }
        binding.removeService(old.handle)
        // A submitted add can still complete after removal; its mapping is needed
        // to remove that late service before releasing the handle.
        if !additions.contains(old.handle) { binding.releaseService(old.handle) }
        old.serving?.resume()
        while !pendingServices.isEmpty {
            if addService(pendingServices.removeFirst()) { break }
        }
    }

    public func finish(_ session: UUID) {
        guard service?.id == session else { return }
        service?.finishing = true
        flush()
    }
    /// Takes the bytes immediately, waiting for readiness internally if the binding is full.
    /// Only a message larger than the owner's maximum fails; inactive sessions are ignored.
    public func send(_ bytes: [UInt8], for session: UUID) throws(Failure) {
        guard service?.id == session, let peer = service?.owner,
              let maximum = service?.subscribers[peer] else { return }
        guard bytes.count <= maximum else {
            throw .messageTooLarge(maximum: maximum, actual: bytes.count)
        }
        service?.queue.append(bytes)
        flush()
    }

    private func flush() {
        if service?.queue.isEmpty == true {
            if service?.finishing == true { removeService() }
            return
        }
        guard let handle = service?.handle, let peer = service?.owner,
              service?.blocked == false else { return }
        while let bytes = service?.queue.first {
            guard binding.update(bytes, service: handle, peer: peer) else {
                service?.blocked = true
                return
            }
            service?.queue.removeFirst()
        }
        if service?.finishing == true { removeService() }
    }

    private func receive(_ event: PeripheralEvent) {
        switch event {
        case .state(let state):
            continuation.yield(.bluetoothState(state))
            if state != .poweredOn {
                let lostOwner = service?.owner.flatMap { service?.subscribers[$0] } != nil
                let peers = service.map { Array($0.subscribers.keys) } ?? []
                service?.subscribers = [:]
                service?.queue = []
                for peer in peers { binding.releaseCentral(peer) }
                if lostOwner, let session = service?.id {
                    continuation.yield(.clientLost(session: session))
                }
            }
            if state != .poweredOn, service?.finishing == true { removeService() }
        case .added(let handle, let error):
            guard let handle, additions.remove(handle) != nil else { return }
            guard service?.handle == handle, let session = service?.id else {
                if error == nil { binding.removeService(handle) }
                binding.releaseService(handle)
                return
            }
            if let error {
                binding.releaseService(handle)
                continuation.yield(.couldNotGoOnAir(session: session, error))
            }
            service?.added = error == nil
            let waiting = service?.serving
            service?.serving = nil
            waiting?.resume()
        case .advertised(let error):
            guard !advertisements.isEmpty else { return }
            let request = advertisements.removeFirst()
            guard service?.handle == request.service, service?.advertising == request.id,
                  let session = service?.id else { return }
            if let error {
                continuation.yield(.couldNotGoOnAir(session: session, error))
            } else {
                continuation.yield(.onAir(session: session))
            }
        case .subscribed(let handle, let peer, let maximum, let characteristic):
            defer { releaseUnusedCentral(peer) }
            guard let handle, service?.handle == handle, characteristic == .toClient else { return }
            service?.subscribers[peer] = maximum
        case .writes(let request, let writes):
            receiveWrites(writes, request: request)
        case .unsubscribed(let handle, let peer, let characteristic):
            defer { releaseUnusedCentral(peer) }
            guard let handle, service?.handle == handle, characteristic == .toClient, let session = service?.id else { return }
            let wasSubscribed = service?.subscribers.removeValue(forKey: peer) != nil
            if service?.owner == peer, wasSubscribed {
                service?.queue = []
                continuation.yield(.clientLost(session: session))
                if service?.finishing == true { removeService() }
            }
        case .ready:
            service?.blocked = false
            flush()
        }
    }

    private func releaseUnusedCentral(_ peer: UUID) {
        if service?.subscribers[peer] == nil { binding.releaseCentral(peer) }
    }

    private func receiveWrites(_ writes: [PeripheralWrite], request: UUID) {
        defer {
            for peer in Set(writes.map(\.peer)) { releaseUnusedCentral(peer) }
        }
        guard let session = service?.id else {
            binding.respond(request, with: .notPermitted)
            return
        }
        var owner = service?.owner
        for write in writes {
            guard write.service == service?.handle,
                  service?.subscribers[write.peer] != nil,
                  (write.characteristic == .clientKey || write.characteristic == .toHost),
                  write.characteristic != .toHost || owner == write.peer,
                  owner == nil || owner == write.peer else {
                binding.respond(request, with: .notPermitted)
                return
            }
            guard write.offset == 0 else {
                binding.respond(request, with: .invalidOffset)
                return
            }
            if write.characteristic == .clientKey { owner = write.peer }
        }
        service?.owner = owner
        for write in writes {
            switch write.characteristic {
            case .clientKey:
                continuation.yield(.clientKey(session: session, peer: write.peer, bytes: write.bytes))
            case .toHost:
                continuation.yield(.decision(session: session, bytes: write.bytes))
            case .toClient, .unsupported: break
            }
        }
        binding.respond(request, with: .success)
    }
}
