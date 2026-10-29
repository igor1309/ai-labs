import Foundation
import Observation
import Testing
import HostUI
import HostBroadcast
import HostPayment
import SessionCrypto
import MessageCodec
import Settings
@testable import Root

@Suite @MainActor struct HostWiringTests {
    enum Transaction: CaseIterable { case success, failure, decline, timeout, lost, cancel }

    @Test(arguments: Transaction.allCases) func hostTransactions(_ transaction: Transaction) async throws {
        let h = Harness()
        defer { h.finish() }
        let root = AppRoot(radios: h.pair, launchSide: .host, clock: h.clock, store: h.store, log: h.log)
        let host = try #require(root.host)
        #expect(host.screen.amount == "0")
        #expect(!host.screen.buttons[0].isEnabled)
        h.host.continuation.yield(.bluetoothState(.poweredOn))
        await until { host.amount?.state.bluetooth == .available }
        for key in [HostEvent.digit(9), .digit(8), .digit(7), .digit(6), .digit(5), .digit(4), .decimalPoint, .digit(2), .digit(3)] {
            host.event(key)
        }
        await until { host.screen.amount == "987654.23" }
        #expect(host.screen.buttons[0].isEnabled)
        host.event(.lockAndBroadcast)
        await until { h.host.calls.contains { if case .advertise = $0 { true } else { false } } }
        let served = try #require(h.host.calls.compactMap { call -> ([UInt8], UUID)? in
            if case .serve(let bytes, let session) = call { (bytes, session) } else { nil }
        }.first)
        let (descriptor, id) = served
        #expect(h.host.calls == [.serve(descriptor, id), .advertise("MIZAN-7F3A", id)])
        #expect(host.screen.status == "Going on air")
        #expect(!root.isAtRest)
        let kept = root.radios.host
        root.choose(.client)
        #expect(root.state.side == .host)
        h.host.continuation.yield(.onAir(session: id))
        await until { h.clock.starts == [60] }
        #expect(host.screen.status == "Advertising")
        #expect(!host.screen.isSettingsEnabled)
        host.event(.openSettings)
        #expect(!host.settingsPresented)
        h.clock.advance(13)
        await until { host.broadcast?.state.secondsLeft == 47 }
        if case .countdown(let ring, _, _) = host.screen.panel {
            #expect(ring.seconds == "47" && ring.fraction == 47.0 / 60)
        } else { Issue.record("Expected a countdown") }

        var secrets = SecretsGate(amount: "987654.23", amountMinorUnits: "98765423")
        secrets.extraBytes += [descriptor]
        secrets.extraStrings += [id.uuidString]
        if transaction == .timeout {
            h.clock.advance(47)
            await until { host.screen.status == "Timed out" && host.amount?.state.amount == "" && root.isAtRest }
            await until { h.host.calls.contains(.retire(id)) }
            #expect(host.screen.amount == "0")
            #expect(h.host.calls == [.serve(descriptor, id), .advertise("MIZAN-7F3A", id), .retire(id)])
            #expect(host.payment == nil)
            #expect(h.log.entries.contains(.init(category: .hostBroadcast, message: "timedOut")))
        } else {
            let client = try ClientPeer(descriptor)
            secrets.extraBytes += [client.session.publicKey, client.descriptor.publicKey, client.descriptor.sessionID]
            // A different session cannot take this attempt or deliver a decision to it.
            h.host.continuation.yield(.clientKey(session: UUID(), peer: secrets.peer, bytes: [0]))
            h.host.continuation.yield(.clientKey(session: id, peer: secrets.peer, bytes: client.session.publicKey))
            await until { host.payment != nil }
            let frame = try #require(h.host.sent.last)
            #expect(try client.open(frame) == .amount(98765423))
            #expect(host.screen.status == "Awaiting client")
            #expect(host.screen.amount == "987654.23")
            #expect(host.broadcast?.state.secondsLeft == nil)
            if case .handedOver(let secure) = host.broadcast?.state.phase {
                #expect(secure.session.id == client.descriptor.sessionID)
                #expect(secure.session.publicKey == client.descriptor.publicKey)
            } else { Issue.record("Broadcast must wait with its secure session") }
            #expect(h.host.calls.prefix(4) == [.serve(descriptor, id), .advertise("MIZAN-7F3A", id), .stop(id), .send(frame, id)])
            h.clock.advance(600)
            // The outcome is observed after a real model event, without sleeping for a missing timeout.
            if transaction == .lost {
                h.host.continuation.yield(.clientLost(session: id))
            } else if transaction == .cancel {
                host.event(.cancel)
            } else {
                let malformed = try client.session.seal([255], kind: MessageCodec.Kind.decision.rawValue)
                let malformedFrame = try MessageCodec.encodeFrame(.init(kind: .decision, counter: malformed.counter, sealedBox: malformed.sealedBox))
                let decision = try client.frame(.decision(transaction == .decline ? .decline : .confirm), kind: .decision)
                secrets.extraBytes += [decision, malformedFrame]
                secrets.extraBytes += [decision, malformedFrame].map { Array($0.dropFirst(5).prefix(12)) }
                h.host.continuation.yield(.decision(session: UUID(), bytes: decision))
                h.host.continuation.yield(.decision(session: id, bytes: [0]))
                h.host.continuation.yield(.decision(session: id, bytes: malformedFrame))
                h.host.continuation.yield(.decision(session: id, bytes: decision))
                if transaction != .decline {
                    await until { host.screen.status == "Processing" && h.host.sent.count == 2 }
                    #expect(!root.isAtRest)
                    #expect(try client.open(h.host.sent[1]) == .acknowledgement(.decision))
                    host.event(transaction == .success ? .success : .failure)
                }
            }
            await until { host.payment?.state.canEnterNewAmount == true && root.isAtRest }
            let expectedStatus: String = switch transaction {
            case .success: "Paid"
            case .failure: "Failed"
            case .decline: "Declined"
            case .lost: "Link lost"
            case .cancel: "Cancelled"
            case .timeout: "Timed out"
            }
            #expect(host.screen.status == expectedStatus)
            #expect(host.screen.buttons.map(\.event) == [.newAmount])
            #expect(host.screen.buttons[0].isEnabled)
            #expect(h.host.calls.last == .finish(id))
            #expect(!h.host.calls.contains(.retire(id)))
            switch transaction {
            case .success, .failure:
                #expect(h.host.sent.count == 3)
                #expect(try client.open(h.host.sent[2]) == .result(transaction == .success ? .success : .failure))
                #expect(host.payment?.state.resultSent == true)
            case .decline:
                #expect(h.host.sent.count == 2)
                #expect(try client.open(h.host.sent[1]) == .acknowledgement(.decision))
            case .cancel:
                #expect(h.host.sent.count == 2)
                #expect(try client.open(h.host.sent[1]) == .end)
            default: #expect(h.host.sent.count == 1)
            }
            let messages = h.log.entries.filter { $0.category == .hostPayment && $0.message.hasPrefix("message ") }
            #expect(messages.count == (transaction == .lost ? 0 : transaction == .cancel ? 1 : transaction == .decline ? 3 : 4))
            #expect(h.log.entries.contains(.init(category: .hostBroadcast, message: "handedOver")))
            #expect(h.log.entries.contains(.init(category: .hostPayment, message: "awaitingDecision")))
            let endedModel = WeakReference(host.payment)
            host.event(.newAmount)
            await until { host.payment == nil && host.amount?.state.amount == "" && host.broadcast?.state.phase == .ready }
            #expect(endedModel.value == nil)
            #expect(host.screen.amount == "0")
            #expect(h.log.entries.contains(.init(category: .hostPayment, message: "over")))
        }
        let amountStates = h.log.entries.filter { $0.category == .amountEntry }.map(\.message)
        #expect(amountStates == [0, 0, 1, 2, 3, 4, 5, 6, 6, 7, 8, 0].map { "typing digits=\($0)" })
        let broadcastStates = h.log.entries.filter { $0.category == .hostBroadcast && !$0.message.hasPrefix("message ") }.map(\.message)
        let opening = ["ready", "goingOnAir", "goingOnAir", "goingOnAir", "goingOnAir", "advertising seconds=60", "advertising seconds=47"]
        let handshake = ["handshake stoppingAdvertising", "handshake derivingKey", "handshake sealingAmount", "handshake sendingAmount", "handedOver", "ready"]
        #expect(broadcastStates == opening + (transaction == .timeout ? ["timedOut"] : handshake))
        let paymentPhases: [String] = switch transaction {
        case .success: ["awaitingDecision"] + Array(repeating: "choosingOutcome", count: 3) + Array(repeating: "paid", count: 5) + ["over"]
        case .failure: ["awaitingDecision"] + Array(repeating: "choosingOutcome", count: 3) + Array(repeating: "failed", count: 5) + ["over"]
        case .decline: ["awaitingDecision"] + Array(repeating: "declined", count: 5) + ["over"]
        case .cancel: ["awaitingDecision"] + Array(repeating: "cancelled", count: 5) + ["over"]
        case .lost: ["awaitingDecision"] + Array(repeating: "linkLost", count: 3) + ["over"]
        case .timeout: []
        }
        #expect(h.log.entries.filter { $0.category == .hostPayment && !$0.message.hasPrefix("message ") }.map(\.message) == paymentPhases)
        let openedMalformed = "message opened kind=decision counter=0 length=34"
        let openedDecision = "message opened kind=decision counter=1 length=34"
        let acknowledgement = "message sent kind=acknowledgement counter=1 length=34"
        let expectedMessages: [String] = switch transaction {
        case .success, .failure: [openedMalformed, openedDecision, acknowledgement, "message sent kind=result counter=2 length=34"]
        case .decline: [openedMalformed, openedDecision, acknowledgement]
        case .cancel: ["message sent kind=end counter=1 length=33"]
        case .lost, .timeout: []
        }
        #expect(h.log.entries.filter { $0.category == .hostPayment && $0.message.hasPrefix("message ") }.map(\.message) == expectedMessages)
        let amountMessage = h.log.entries.filter { $0.category == .hostBroadcast && $0.message.hasPrefix("message ") }
        #expect(amountMessage.map(\.message) == (transaction == .timeout ? [] : ["message sent kind=amount counter=0 length=41"]))
        secrets.extraBytes += h.host.sent
        secrets.extraBytes += h.host.sent.compactMap { try? MessageCodec.decodeFrame($0).sealedBox }.map { Array($0.prefix(12)) }
        secrets.assertAbsent(from: h.log.entries)
        root.choose(.client)
        #expect(root.host == nil)
        #expect(root.radios.host === kept)
        #expect(host.amount == nil && host.broadcast == nil && host.payment == nil)
    }

    @Test func decisionDuringAmountSendReachesTheHandedOverSession() async throws {
        let h = Harness()
        defer { h.finish(); h.host.onSend = nil }
        let root = AppRoot(radios: h.pair, launchSide: .host, clock: h.clock, store: h.store, log: h.log)
        let host = try #require(root.host)
        h.host.continuation.yield(.bluetoothState(.poweredOn))
        await until { host.amount?.state.bluetooth == .available }
        host.event(.digit(1))
        await until { host.screen.amount == "1" }
        host.event(.lockAndBroadcast)
        await until { h.host.calls.contains { if case .advertise = $0 { true } else { false } } }
        let (descriptor, id) = try #require(h.host.calls.compactMap { call -> ([UInt8], UUID)? in
            if case .serve(let bytes, let id) = call { (bytes, id) } else { nil }
        }.first)
        let client = try ClientPeer(descriptor)
        let decision = try client.frame(.decision(.decline), kind: .decision)
        h.host.onSend = { bytes, id in
            if (try? MessageCodec.decodeFrame(bytes).kind) == .amount {
                host.receive(.decision(session: id, bytes: decision))
            }
        }
        h.host.continuation.yield(.onAir(session: id))
        await until { host.broadcast?.state.phase == .advertising }
        h.host.continuation.yield(.clientKey(session: id, peer: UUID(), bytes: client.session.publicKey))
        await until { host.payment != nil }
        let later = try client.frame(.decision(.confirm), kind: .decision)
        host.receive(.decision(session: id, bytes: later))
        await until { h.host.sent.count == 2 }
        #expect(host.payment?.state.phase == .declined)
        #expect(try client.open(h.host.sent[1]) == .acknowledgement(.decision))
    }

    @Test(arguments: [true, false]) func lossDuringDeferredHandOverReachesPayment(_ bluetooth: Bool) async throws {
        let h = Harness()
        defer { h.finish(); h.log.onEntry = nil }
        let root = AppRoot(radios: h.pair, launchSide: .host, clock: h.clock, store: h.store, log: h.log)
        let host = try #require(root.host)
        h.host.continuation.yield(.bluetoothState(.poweredOn))
        await until { host.amount?.state.bluetooth == .available }
        host.event(.digit(1))
        await until { host.screen.amount == "1" }
        host.event(.lockAndBroadcast)
        await until { h.host.calls.contains { if case .advertise = $0 { true } else { false } } }
        let (descriptor, id) = try #require(h.host.calls.compactMap { call -> ([UInt8], UUID)? in
            if case .serve(let bytes, let id) = call { (bytes, id) } else { nil }
        }.first)
        let client = try ClientPeer(descriptor)
        h.log.onEntry = { [weak host] entry in
            if entry.category == .hostBroadcast && entry.message == "handedOver" {
                Task { @MainActor [weak host] in
                    host?.receive(bluetooth ? .bluetoothState(.poweredOff) : .clientLost(session: id))
                }
            }
        }
        h.host.continuation.yield(.onAir(session: id))
        await until { host.broadcast?.state.phase == .advertising }
        h.host.continuation.yield(.clientKey(session: id, peer: UUID(), bytes: client.session.publicKey))
        await until { host.payment != nil }
        host.receive(.decision(session: id, bytes: try client.frame(.decision(.decline), kind: .decision)))
        await until { host.payment?.state.canEnterNewAmount == true }
        #expect(host.payment?.state.phase == .linkLost)
        #expect(h.host.sent.count == 1)
    }

    @Test(arguments: [true, false]) func switchAtRestReleasesModelsAndPreservesRadioCleanup(_ cancelled: Bool) async throws {
        let h = Harness()
        defer { h.finish() }
        let root = AppRoot(radios: h.pair, launchSide: .host, clock: h.clock, store: h.store, log: h.log)
        let host = try #require(root.host)
        h.host.continuation.yield(.bluetoothState(.poweredOn))
        await until { host.amount?.state.bluetooth == .available }
        host.event(.digit(1))
        await until { host.screen.amount == "1" }
        host.event(.lockAndBroadcast)
        await until { h.host.calls.contains { if case .advertise = $0 { true } else { false } } }
        let id = try #require(h.host.calls.compactMap { call -> UUID? in
            if case .advertise(_, let id) = call { id } else { nil }
        }.first)
        if cancelled {
            host.event(.cancel)
            await until { host.broadcast?.state.phase == .ready }
        } else {
            let descriptor = try #require(h.host.calls.compactMap { call -> [UInt8]? in
                if case .serve(let bytes, _) = call { bytes } else { nil }
            }.first)
            let client = try ClientPeer(descriptor)
            h.host.continuation.yield(.onAir(session: id))
            await until { host.broadcast?.state.phase == .advertising }
            h.host.continuation.yield(.clientKey(session: id, peer: UUID(), bytes: client.session.publicKey))
            await until { host.payment != nil }
            h.host.continuation.yield(.decision(session: id, bytes: try client.frame(.decision(.decline), kind: .decision)))
            await until { host.payment?.state.canEnterNewAmount == true }
        }
        let oldBroadcast = WeakReference(host.broadcast)
        let oldPayment = WeakReference(host.payment)
        root.choose(.client)
        #expect(h.host.calls.last == (cancelled ? .retire(id) : .finish(id)))
        #expect(!h.host.calls.contains(cancelled ? .finish(id) : .retire(id)))
        #expect(oldBroadcast.value == nil && oldPayment.value == nil)
        #expect(root.state.side == .client)
    }

    @Test func settingsAndFreshMode() async throws {
        let h = Harness()
        defer { h.finish() }
        let root = AppRoot(radios: h.pair, launchSide: .host, clock: h.clock, store: h.store, log: h.log)
        let host = try #require(root.host)
        host.event(.openSettings)
        #expect(host.settingsPresented)
        for seconds in Settings.countdownChoices {
            host.event(.chooseCountdown(seconds))
            #expect(host.settingsScreen.countdown.selectedSeconds == seconds)
            #expect(h.store.values[.countdown] == .number(Double(seconds)))
        }
        host.event(.chooseCountdown(45))
        #expect(host.settingsScreen.countdown.selectedSeconds == 120)
        host.event(.done)
        #expect(!host.settingsPresented)
        h.host.continuation.yield(.bluetoothState(.poweredOn))
        await until { host.amount?.state.bluetooth == .available }
        host.event(.digit(1))
        await until { host.screen.amount == "1" }
        root.choose(.client)
        root.choose(.host)
        let fresh = try #require(root.host)
        #expect(fresh !== host)
        #expect(fresh.screen.amount == "0")
        #expect(fresh.amount?.state.bluetooth == .available)
        #expect(fresh.settingsScreen.countdown.selectedSeconds == 120)
    }
}

@MainActor func until(_ condition: @escaping @MainActor () -> Bool) async {
    while !condition() {
        await withCheckedContinuation { continuation in
            withObservationTracking { _ = condition() } onChange: { continuation.resume() }
        }
    }
}

@MainActor final class ClientPeer {
    let descriptor: MessageCodec.Session
    let session: SessionCrypto
    init(_ bytes: [UInt8]) throws {
        descriptor = try MessageCodec.decodeSession(bytes)
        session = try SessionCrypto(sessionID: descriptor.sessionID)
        try session.derive(peerPublicKey: descriptor.publicKey)
    }
    func frame(_ message: MessageCodec.Message, kind: MessageCodec.Kind) throws -> [UInt8] {
        let sealed = try session.seal(MessageCodec.encodeBody(message), kind: kind.rawValue)
        return try MessageCodec.encodeFrame(.init(kind: kind, counter: sealed.counter, sealedBox: sealed.sealedBox))
    }
    func open(_ bytes: [UInt8]) throws -> MessageCodec.Message {
        let frame = try MessageCodec.decodeFrame(bytes)
        let body = try session.open(.init(counter: frame.counter, sealedBox: frame.sealedBox), kind: frame.kind.rawValue)
        return try MessageCodec.decodeBody(body, kind: frame.kind)
    }
}

extension HostSpy {
    var sent: [[UInt8]] { calls.compactMap { if case .send(let bytes, _) = $0 { bytes } else { nil } } }
}

final class WeakReference<Value: AnyObject> {
    weak var value: Value?
    init(_ value: Value?) { self.value = value }
}
