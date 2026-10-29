import Foundation
import Root
import ScriptedSettings
import SessionCrypto
import MessageCodec

@MainActor final class ScriptedClient: ClientRadioPort {
    @MainActor private final class Transaction {
        enum Phase { case connecting, key, amount, decision, done }
        let host: UUID
        let settings: Settings.Host
        let crypto = SessionCrypto()
        let steps = PendingSteps()
        var phase = Phase.connecting
        init(host: UUID, settings: Settings.Host) { self.host = host; self.settings = settings }
    }
    let events: AsyncStream<ClientRadioEvent>
    private let continuation: AsyncStream<ClientRadioEvent>.Continuation
    private let source: any SettingsSource
    private let clock: any RadioClock
    private let sealMessage: @MainActor (MessageCodec.Message, SessionCrypto) throws -> [UInt8]
    private var updatesTask: Task<Void, Never>?
    private var catalog: [UUID: Settings.Host] = [:]
    private var scanning = false
    private let readings = PendingSteps()
    private var transaction: Transaction?

    init(source: any SettingsSource, clock: any RadioClock,
         sealMessage: @escaping @MainActor (MessageCodec.Message, SessionCrypto) throws -> [UInt8] = { try Wire.seal($0, with: $1) }) {
        self.sealMessage = sealMessage
        self.source = source; self.clock = clock
        (events, continuation) = AsyncStream.makeStream()
        continuation.yield(.bluetooth(source.current().clientState))
        let updates = source.updates
        updatesTask = Task.immediate { [weak self] in
            for await result in updates {
                guard let self else { return }
                if result.clientState != .on { stopScanning(); drop() }
                continuation.yield(.bluetooth(result.clientState))
            }
        }
    }

    func startScanning() {
        guard !scanning, let settings = source.current().settings, settings.bluetooth == .on else { return }
        scanning = true
        catalog.removeAll()
        for host in settings.hosts {
            let id = UUID()
            catalog[id] = host
            for reading in host.readings {
                readings.add(clock.schedule(after: reading.time) { [weak self] in
                    guard let self, scanning else { return }
                    continuation.yield(.reading(host: id, name: host.name, rssi: reading.rssi, time: clock.now))
                })
            }
        }
    }
    func stopScanning() { scanning = false; readings.cancel() }

    func connect(to host: UUID) {
        drop()
        guard let settings = catalog[host], source.current().clientState == .on else {
            continuation.yield(.couldNotConnect(host: host, reason: .unavailableHost)); return
        }
        let t = Transaction(host: host, settings: settings)
        transaction = t
        later(settings.delays.connect, in: t) { radio, t in
            do {
                let bytes = try MessageCodec.encodeSession(.init(publicKey: t.crypto.publicKey, sessionID: t.crypto.sessionID))
                t.phase = .key
                radio.continuation.yield(.connected(host: t.host, session: bytes, largestWrite: 512))
                if t.settings.drop == .beforeKey { radio.dropLater(t) }
            } catch { radio.drop() }
        }
    }

    func writeKey(_ bytes: [UInt8]) {
        guard let t = transaction, t.phase == .key, t.settings.drop != .beforeKey else { return }
        do { try t.crypto.derive(peerPublicKey: bytes) } catch { drop(); return }
        t.phase = .amount
        later(t.settings.delays.key, in: t) { radio, t in
            radio.continuation.yield(.writeAnswered(.key, nil))
            do {
                // Seal before scheduling delivery: a link can be lost with a frame in flight.
                let amount = try radio.sealMessage(.amount(t.settings.amount), t.crypto)
                if t.settings.drop == .beforeAmountArrives { radio.drop(); return }
                radio.later(t.settings.delays.amount, in: t) { radio, t in
                    t.phase = .decision
                    radio.continuation.yield(.message(host: t.host, bytes: amount))
                    if t.settings.drop == .afterAmount { radio.dropLater(t) }
                    else if t.settings.cancelsAfterAmount {
                        radio.later(t.settings.delays.end, in: t) { radio, t in
                            do {
                                let end = try radio.sealMessage(.end, t.crypto)
                                t.phase = .done
                                radio.continuation.yield(.message(host: t.host, bytes: end))
                            } catch { radio.drop() }
                        }
                    }
                }
            } catch { radio.drop() }
        }
    }

    func write(_ bytes: [UInt8]) async -> ClientWriteResult {
        guard let t = transaction else { return .failure(.notConnected) }
        do {
            let message = try Wire.open(bytes, with: t.crypto)
            guard t.phase == .decision, case .decision(let decision) = message else { drop(); return .failure(.disconnected) }
            t.phase = .done
            if t.settings.drop == .afterAmount {
                continuation.yield(.writeAnswered(.message, nil))
                return .success(())
            }
            // The ATT response precedes the separately delayed notification.
            continuation.yield(.writeAnswered(.message, nil))
            later(t.settings.delays.acknowledgement, in: t) { radio, t in
                do {
                    let ack = try radio.sealMessage(.acknowledgement(.decision), t.crypto)
                    radio.continuation.yield(.message(host: t.host, bytes: ack))
                    if t.settings.drop == .afterAcknowledgement { radio.dropLater(t); return }
                    if decision == .confirm {
                        radio.later(t.settings.delays.outcome, in: t) { radio, t in
                            do {
                                let result = try radio.sealMessage(.result(t.settings.outcome == .success ? .success : .failure), t.crypto)
                                radio.continuation.yield(.message(host: t.host, bytes: result))
                            } catch { radio.drop() }
                        }
                    }
                } catch { radio.drop() }
            }
            return .success(())
        } catch { drop(); return .failure(.disconnected) }
    }

    func drop() {
        guard let t = transaction else { return }
        t.steps.cancel()
        t.crypto.close()
        transaction = nil
        continuation.yield(.dropped(host: t.host))
    }
    private func later(_ delay: Double, in t: Transaction,
                       _ action: @escaping @MainActor (ScriptedClient, Transaction) -> Void) {
        t.steps.add(clock.schedule(after: delay) { [weak self, weak t] in
            guard let self, let t, transaction === t else { return }
            action(self, t)
        })
    }
    private func dropLater(_ t: Transaction) {
        later(t.settings.delays.drop, in: t) { radio, _ in radio.drop() }
    }
    isolated deinit { updatesTask?.cancel(); readings.cancel(); drop(); continuation.finish() }
}
