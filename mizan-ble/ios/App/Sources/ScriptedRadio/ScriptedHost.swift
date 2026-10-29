import Foundation
import Root
import ScriptedSettings
import SessionCrypto
import MessageCodec

@MainActor final class ScriptedHost: HostRadioPort {
    @MainActor private final class Transaction {
        enum Phase { case amount, acknowledgement, outcome, done }
        let id: UUID
        let peer = UUID()
        let settings: Settings.Client
        let crypto: SessionCrypto
        let steps = PendingSteps()
        var keyed = false
        var advertising = false
        var phase = Phase.amount
        var confirmed = false
        init(id: UUID, settings: Settings.Client, crypto: SessionCrypto) {
            self.id = id; self.settings = settings; self.crypto = crypto
        }
    }

    let events: AsyncStream<HostRadioEvent>
    private let continuation: AsyncStream<HostRadioEvent>.Continuation
    private let source: any SettingsSource
    private let clock: any RadioClock
    private var updatesTask: Task<Void, Never>?
    private var transaction: Transaction?

    init(source: any SettingsSource, clock: any RadioClock) {
        self.source = source; self.clock = clock
        (events, continuation) = AsyncStream.makeStream()
        continuation.yield(.bluetoothState(source.current().hostState))
        let updates = source.updates
        updatesTask = Task.immediate { [weak self] in
            for await result in updates {
                guard let self else { return }
                if result.hostState != .poweredOn { lose() }
                continuation.yield(.bluetoothState(result.hostState))
            }
        }
    }

    func serve(_ bytes: [UInt8], for session: UUID) async {
        end()
        guard let settings = source.current().settings, settings.bluetooth == .on,
              let description = try? MessageCodec.decodeSession(bytes),
              let crypto = try? SessionCrypto(sessionID: description.sessionID),
              (try? crypto.derive(peerPublicKey: description.publicKey)) != nil else { return }
        transaction = Transaction(id: session, settings: settings.client, crypto: crypto)
    }

    func advertise(_ name: String, for session: UUID) {
        guard let t = transaction, t.id == session, !t.advertising, !t.keyed else { return }
        t.advertising = true
        continuation.yield(.onAir(session: session))
        guard t.settings.comes else { return }
        later(t.settings.delays.connect + t.settings.delays.key, in: t) { radio, t in
            guard t.advertising else { return }
            if t.settings.drop == .beforeKey { radio.end(); return }
            t.keyed = true
            radio.continuation.yield(.clientKey(session: t.id, peer: t.peer, bytes: t.crypto.publicKey))
            if t.settings.drop == .afterKey { radio.dropLater(t) }
        }
    }

    func stopAdvertising(for session: UUID) {
        guard transaction?.id == session else { return }
        transaction?.advertising = false
    }
    func retire(_ session: UUID) { if transaction?.id == session { end() } }
    func finish(_ session: UUID) { if transaction?.id == session { end() } }

    func send(_ bytes: [UInt8], for session: UUID) throws(HostRadioFailure) {
        guard let t = transaction, t.id == session, t.keyed else { return }
        do {
            let message = try Wire.open(bytes, with: t.crypto)
            if t.settings.drop == .afterKey { return }
            if message == .end { t.phase = .done; return }
            switch (t.phase, message) {
            case (.amount, .amount):
                t.phase = .acknowledgement
                if t.settings.drop == .afterAmount { dropLater(t); return }
                later(t.settings.delays.decision, in: t) { radio, t in
                    do {
                        let decision: MessageCodec.Decision = t.settings.decision == .confirm ? .confirm : .decline
                        let bytes = try Wire.seal(.decision(decision), with: t.crypto)
                        t.confirmed = decision == .confirm
                        radio.continuation.yield(.decision(session: t.id, bytes: bytes))
                        if t.settings.drop == .afterDecision { radio.dropLater(t) }
                    } catch { radio.lose() }
                }
            case (.acknowledgement, .acknowledgement(.decision)):
                t.phase = t.confirmed ? .outcome : .done
            case (.outcome, .result): t.phase = .done
            default: lose()
            }
        } catch { lose() }
    }

    private func later(_ delay: Double, in t: Transaction,
                       _ action: @escaping @MainActor (ScriptedHost, Transaction) -> Void) {
        t.steps.add(clock.schedule(after: delay) { [weak self, weak t] in
            guard let self, let t, transaction === t else { return }
            action(self, t)
        })
    }
    private func dropLater(_ t: Transaction) {
        later(t.settings.delays.drop, in: t) { radio, _ in radio.lose() }
    }
    private func lose() {
        if let t = transaction, t.keyed { continuation.yield(.clientLost(session: t.id)) }
        end()
    }
    private func end() {
        transaction?.steps.cancel()
        transaction?.crypto.close()
        transaction = nil
    }
    isolated deinit { updatesTask?.cancel(); end(); continuation.finish() }
}
