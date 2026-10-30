import Foundation
import Testing
import ClientFind
import ClientConnect
import ClientReview
import ClientPayment
import MessageCodec
import SessionCrypto
@testable import Root

@Suite @MainActor struct ClientWiringTests {
    enum Transaction: CaseIterable {
        case success, failure, decline, cannotConnect, lostBeforeAmount, lostReview, lostConfirm, lostPayment
        case deadline, cancel, hostCancel, refused
    }

    @Test(arguments: Transaction.allCases) func clientTransactions(_ outcome: Transaction) async throws {
        let h = Harness()
        defer { h.finish() }
        let root = AppRoot(radios: h.pair, launchSide: .client, clock: h.clock, store: h.store, log: h.log)
        let client = try #require(root.client)
        let kept = root.radios.client
        let finding = WeakReference(client.find)
        #expect(client.screen.title == "No host nearby")
        try await pickHost(h, client)
        #expect(client.screen.title == "Pay a nearby host")
        #expect(client.screen.detail == "MIZAN-7F3A is in range. Start the handshake to see the amount.")
        #expect(client.screen.actions.first?.isEnabled == true)
        #expect(root.isAtRest)
        client.event(.startHandshake)
        await until { h.client.calls.contains(.connect(nearHost)) }
        let connecting = WeakReference(client.connect)
        #expect(client.connect?.state.host.id == nearHost.uuidString)
        #expect(client.connect?.state.host.name == "MIZAN-7F3A")
        #expect(client.screen.title == "Connecting…")
        #expect(!root.isAtRest && !root.modeSwitchState.isEnabled)
        root.choose(.host)
        #expect(root.state.side == .client)
        #expect(h.client.calls == [.start, .stop, .connect(nearHost)])
        #expect(h.clock.starts == [10])
        var secrets = SecretsGate(amount: "987654.23", amountMinorUnits: "98765423")
        secrets.extraStrings += ["MIZAN-7F3A", "MIZAN-ABCD"]
        secrets.extraIDs += [nearHost, farHost]
        if [.cannotConnect, .deadline, .cancel].contains(outcome) {
            switch outcome {
            case .cannotConnect:
                h.client.continuation.yield(.couldNotConnect(host: nearHost, reason: .unavailableHost))
            case .deadline: h.clock.advance(10)
            default: client.event(.cancel)
            }
            if outcome != .cancel {
                await until { client.screen.title == "Couldn’t connect" && h.client.calls.last == .drop }
                #expect(client.screen.detail.contains("You were not charged."))
                #expect(client.screen.actions.map(\.event) == [.tryAgain])
                #expect(root.isAtRest)
                client.event(.tryAgain)
            }
        } else {
            let host = HostPeer()
            let descriptor = try host.descriptor()
            secrets.extraBytes += [descriptor, host.crypto.publicKey, host.crypto.sessionID]
            h.client.continuation.yield(.connected(host: farHost, session: [0], largestWrite: 1))
            h.client.continuation.yield(.connected(host: nearHost, session: descriptor, largestWrite: 100))
            await until { h.client.calls.contains { if case .key = $0 { true } else { false } } }
            let key = try #require(h.client.calls.compactMap { if case .key(let bytes) = $0 { bytes } else { nil } }.first)
            secrets.extraBytes += [key]
            try host.crypto.derive(peerPublicKey: key)
            if outcome == .lostBeforeAmount {
                h.client.continuation.yield(.dropped(host: nearHost))
                await until { client.screen.title == "Couldn’t connect" && h.client.calls.last == .drop }
                #expect(root.isAtRest)
                client.event(.tryAgain)
            } else {
                let amount = try host.frame(.amount(98765423), kind: .amount)
                secrets.extraBytes += [amount]
                // A notification may beat the key write response.
                h.client.continuation.yield(.message(host: nearHost, bytes: amount))
                h.client.continuation.yield(.writeAnswered(.key, nil))
                await until { client.review != nil && client.connect == nil }
                let reviewing = WeakReference(client.review)
                #expect(connecting.value == nil)
                #expect(client.review?.state.host.id == nearHost.uuidString)
                #expect(client.review?.state.amount == 98765423)
                #expect(client.paymentScreen?.content == .review(title: "MIZAN-7F3A asks for", amount: "987654.23", detail: "Confirm to pay this amount. Decline to end the request."))
                #expect(!root.isAtRest)
                h.clock.advance(600)
                if outcome == .lostReview {
                    h.client.continuation.yield(.dropped(host: nearHost))
                } else if outcome == .hostCancel {
                    let end = try host.frame(.end, kind: .end)
                    secrets.extraBytes += [end]
                    h.client.continuation.yield(.message(host: nearHost, bytes: end))
                } else {
                    if outcome == .refused { h.client.result = .failure(.att(code: 42)) }
                    client.event(outcome == .decline ? .decline : .confirm)
                    await until { !h.client.written.isEmpty }
                    let decision = try #require(h.client.written.first)
                    secrets.extraBytes += [decision]
                    #expect(try host.open(decision) == .decision(outcome == .decline ? .decline : .confirm))
                    if outcome != .refused {
                        #expect(client.paymentScreen?.pill.title == "Sending")
                        #expect(client.paymentScreen?.actions.allSatisfy { !$0.isEnabled } == true)
                        if outcome == .lostConfirm {
                            h.client.continuation.yield(.dropped(host: nearHost))
                        } else {
                            let acknowledgement = try host.frame(.acknowledgement(.decision), kind: .acknowledgement)
                            secrets.extraBytes += [acknowledgement]
                            let immediateResult = outcome == .success ? try host.frame(.result(.success), kind: .result) : nil
                            h.client.continuation.yield(.message(host: nearHost, bytes: acknowledgement))
                            if let immediateResult {
                                secrets.extraBytes += [immediateResult]
                                h.client.continuation.yield(.message(host: nearHost, bytes: immediateResult))
                            }
                            if outcome != .decline {
                                await until { client.payment != nil && client.review == nil }
                                #expect(reviewing.value == nil)
                                #expect(client.payment?.state.hostName == "MIZAN-7F3A")
                                #expect(client.payment?.state.amountMinorUnits == 98765423)
                                if outcome != .success {
                                    #expect(client.paymentScreen?.pill.title == "Waiting")
                                    #expect(client.paymentScreen?.actions.isEmpty == true)
                                    #expect(!root.isAtRest)
                                    h.clock.advance(600)
                                    let result = try host.frame(.result(outcome == .failure ? .failure : .success), kind: .result)
                                    secrets.extraBytes += [result]
                                    // A foreign host cannot finish this payment; the received result still uses the handed-over session.
                                    h.client.continuation.yield(.message(host: farHost, bytes: result))
                                    h.client.continuation.yield(outcome == .lostPayment ? .dropped(host: nearHost) : .message(host: nearHost, bytes: result))
                                }
                            }
                        }
                    }
                }
                await until { h.client.calls.last == .drop && root.isAtRest }
                let pill: String = switch outcome {
                case .success: "Paid"
                case .failure, .refused: outcome == .failure ? "Failed" : "Link lost"
                case .decline: "Declined"
                case .hostCancel: "Cancelled"
                default: "Link lost"
                }
                #expect(client.paymentScreen?.pill.title == pill)
                if [.lostConfirm, .lostPayment].contains(outcome) {
                    #expect(client.paymentScreen?.content == .result(mark: .linkLost, title: "Result unknown", detail: "The link to MIZAN-7F3A was lost before a result arrived. Check with the host before paying again."))
                }
                #expect(client.paymentScreen?.actions.map(\.event) == [.done])
                let paid = WeakReference(client.payment)
                client.event(.done)
                await until { client.review == nil && client.payment == nil }
                #expect(reviewing.value == nil && paid.value == nil)
            }
        }
        await until { client.connect == nil && client.find?.state.phase == .scanning }
        #expect(connecting.value == nil)
        #expect(finding.value === client.find)
        #expect(client.screen.title == "No host nearby")
        #expect(h.client.calls.last == .start)
        #expect(h.client.calls.filter { $0 == .drop }.count == 1)
        #expect(root.isAtRest)
        let findPhases = phases(h.log, .clientFind)
        #expect(findPhases == ["idle", "startingScan", "scanning none", "scanning holdCloser", "scanning host", "stoppingScan", "handedOver", "startingScan", "scanning none"])
        let opening = ["idle", "connecting startingDeadline", "connecting connecting"]
        let connectPhases: [String] = switch outcome {
        case .cannotConnect, .deadline: opening + ["couldNotConnect", "over"]
        case .cancel: opening + ["ending", "over"]
        case .lostBeforeAmount: opening + ["connecting deriving", "connecting writingKey", "couldNotConnect", "over"]
        default: opening + ["connecting deriving", "connecting writingKey", "connecting openingAmount", "connecting stoppingDeadline", "handedOver"]
        }
        let actualConnectPhases = phases(h.log, .clientConnect)
        if [.cannotConnect, .deadline, .lostBeforeAmount].contains(outcome) {
            // Retry waits in ending when cleanup is still in flight.
            #expect(actualConnectPhases == connectPhases || actualConnectPhases == Array(connectPhases.dropLast()) + ["ending", "over"])
        } else { #expect(actualConnectPhases == connectPhases) }
        if ![.cannotConnect, .deadline, .cancel, .lostBeforeAmount].contains(outcome) {
            #expect(h.log.entries.contains(.init(category: .clientConnect, message: "handedOver")))
            let reviewPhases: [String] = switch outcome {
            case .lostReview: ["reviewing", "ended linkLost notCharged", "over"]
            case .hostCancel: ["reviewing", "ended hostCancelled", "over"]
            case .decline: ["reviewing", "sending decline", "ended declined", "over"]
            case .lostConfirm: ["reviewing", "sending confirm", "ended linkLost unknown", "over"]
            case .refused: ["reviewing", "sending confirm", "ended linkLost notCharged", "over"]
            default: ["reviewing", "sending confirm", "handedOver"]
            }
            #expect(phases(h.log, .clientReview) == reviewPhases)
            #expect(h.log.entries.contains(.init(category: .clientConnect, message: "message opened kind=amount counter=0 length=41")))
            if [.success, .failure, .lostPayment].contains(outcome) {
                #expect(phases(h.log, .clientPayment) == ["waiting", outcome == .lostPayment ? "lost" : outcome == .failure ? "failed" : "paid", "over"])
                #expect(h.log.entries.contains(.init(category: .clientReview, message: "message sent kind=decision counter=0 length=34")))
                #expect(h.log.entries.contains(.init(category: .clientReview, message: "message opened kind=acknowledgement counter=1 length=34")))
                if outcome != .lostPayment {
                    #expect(h.log.entries.contains(.init(category: .clientPayment, message: "message opened kind=result counter=2 length=34")))
                }
            }
        }
        #expect(h.log.entries.contains(.init(category: .clientFind, message: "picker holdCloser rssi=-62 hosts=1")))
        #expect(h.log.entries.contains(.init(category: .clientFind, message: "picker host rssi=-45 hosts=2")))
        secrets.extraBytes += secrets.extraBytes.compactMap { try? MessageCodec.decodeFrame($0).sealedBox }.map { Array($0.prefix(12)) }
        secrets.assertAbsent(from: h.log.entries)
        root.choose(.host)
        #expect(root.client == nil)
        #expect(root.radios.client === kept)
        #expect(client.find == nil && client.connect == nil && client.review == nil && client.payment == nil)
        #expect(finding.value == nil)
    }

    enum Arrival: CaseIterable { case message, drop, bluetooth }
    @Test(arguments: [true, false], Arrival.allCases)
    func deferredHandovers(_ fromConnect: Bool, _ arrival: Arrival) async throws {
        let h = Harness()
        defer { h.finish(); h.log.onEntry = nil }
        let root = AppRoot(radios: h.pair, launchSide: .client, clock: h.clock, store: h.store, log: h.log)
        let client = try #require(root.client)
        try await pickHost(h, client)
        client.event(.startHandshake)
        await until { h.client.calls.contains(.connect(nearHost)) }
        let connecting = WeakReference(client.connect)
        let peer = HostPeer()
        h.client.continuation.yield(.connected(host: nearHost, session: try peer.descriptor(), largestWrite: 100))
        await until { h.client.calls.contains { if case .key = $0 { true } else { false } } }
        let key = try #require(h.client.calls.compactMap { if case .key(let bytes) = $0 { bytes } else { nil } }.first)
        try peer.crypto.derive(peerPublicKey: key)
        let amount = try peer.frame(.amount(98765423), kind: .amount)
        let acknowledgement = fromConnect ? nil : try peer.frame(.acknowledgement(.decision), kind: .acknowledgement)
        let message = try peer.frame(fromConnect ? .end : .result(.success), kind: fromConnect ? .end : .result)
        let category: LogEntry.Category = fromConnect ? .clientConnect : .clientReview
        h.log.onEntry = { [weak client] entry in
            if entry.category == category && entry.message == "handedOver" {
                Task { @MainActor [weak client] in
                    switch arrival {
                    case .message: client?.receive(.message(host: nearHost, bytes: message))
                    case .drop: client?.receive(.dropped(host: nearHost))
                    case .bluetooth: client?.receive(.bluetooth(.off))
                    }
                }
            }
        }
        h.client.continuation.yield(.writeAnswered(.key, nil))
        h.client.continuation.yield(.message(host: nearHost, bytes: amount))
        await until { client.review != nil && client.connect == nil }
        #expect(connecting.value == nil)
        if !fromConnect {
            let reviewing = WeakReference(client.review)
            client.event(.confirm)
            await until { !h.client.written.isEmpty }
            #expect(try peer.open(h.client.written[0]) == .decision(.confirm))
            h.client.continuation.yield(.message(host: nearHost, bytes: try #require(acknowledgement)))
            await until { client.payment != nil && client.review == nil }
            #expect(reviewing.value == nil)
        }
        await until { h.client.calls.last == .drop && root.isAtRest }
        #expect(client.paymentScreen?.pill.title == (arrival == .message ? (fromConnect ? "Cancelled" : "Paid") : "Link lost"))
        client.event(.done)
        await until { client.review == nil && client.payment == nil }
        #expect(client.find != nil)
    }

    @Test func pickerTicksAndFreshMode() async throws {
        let h = Harness()
        defer { h.finish() }
        h.store.set(.number(0.5), for: .pickerFade)
        let root = AppRoot(radios: h.pair, launchSide: .client, clock: h.clock, store: h.store, log: h.log)
        let client = try #require(root.client)
        try await pickHost(h, client)
        h.clock.advance(2)
        await until { client.screen.title == "Host went quiet" }
        #expect(!client.screen.actions[0].isEnabled)
        h.client.continuation.yield(.bluetooth(.off))
        await until { client.find?.state.phase == .idle }
        #expect(client.screen.title == "Bluetooth is off")
        let old = WeakReference(client.find)
        root.choose(.host)
        #expect(old.value == nil)
        // The cached client radio state applies when this mode is rebuilt.
        root.choose(.client)
        let fresh = try #require(root.client)
        #expect(fresh !== client)
        await until { fresh.find?.state.bluetooth != .unknown }
        #expect(fresh.screen.title == "Bluetooth is off")
        #expect(root.isAtRest)
    }
}

@MainActor private func pickHost(_ h: Harness, _ client: ClientMode) async throws {
    h.client.continuation.yield(.bluetooth(.on))
    await until { client.find?.state.phase == .scanning }
    for index in 0...4 {
        h.client.continuation.yield(.reading(host: farHost, name: "MIZAN-ABCD", rssi: -62, time: Double(index) / 4))
        h.client.continuation.yield(.reading(host: nearHost, name: "MIZAN-7F3A", rssi: -45, time: Double(index) / 4))
    }
    await until { client.find?.state.canStart == true }
}
private let nearHost = UUID(uuidString: "A53FAE84-3512-41CB-B243-854976E71F24")!
private let farHost = UUID(uuidString: "B253145B-49E4-4BD6-A723-13562AEE71F5")!

@MainActor final class HostPeer {
    let crypto = SessionCrypto()
    func descriptor() throws -> [UInt8] {
        try MessageCodec.encodeSession(.init(publicKey: crypto.publicKey, sessionID: crypto.sessionID))
    }
    func frame(_ message: MessageCodec.Message, kind: MessageCodec.Kind) throws -> [UInt8] {
        let sealed = try crypto.seal(MessageCodec.encodeBody(message), kind: kind.rawValue)
        return try MessageCodec.encodeFrame(.init(kind: kind, counter: sealed.counter, sealedBox: sealed.sealedBox))
    }
    func open(_ bytes: [UInt8]) throws -> MessageCodec.Message {
        let frame = try MessageCodec.decodeFrame(bytes)
        return try MessageCodec.decodeBody(crypto.open(.init(counter: frame.counter, sealedBox: frame.sealedBox), kind: frame.kind.rawValue), kind: frame.kind)
    }
}

extension ClientSpy {
    var written: [[UInt8]] { calls.compactMap { if case .write(let bytes) = $0 { bytes } else { nil } } }
}
private func phases(_ log: LogSpy, _ category: LogEntry.Category) -> [String] {
    log.entries.filter { $0.category == category && !$0.message.hasPrefix("message ") && !$0.message.hasPrefix("picker ") }.map(\.message).reduce([]) { result, phase in
        result.last == phase ? result : result + [phase]
    }
}
