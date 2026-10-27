import CryptoKit
import Foundation
@testable import SessionCrypto
import Testing

private typealias Session = SessionCrypto

struct SessionCryptoTests {
    @Test func bothSidesReadWhatTheOtherSealed() throws {
        let (host, client) = try pair()
        let amount: [UInt8] = [0, 0, 0, 0, 0, 0, 0x30, 0xA2]
        let confirm: [UInt8] = [1]

        #expect(try client.open(host.seal(amount, kind: 1), kind: 1) == amount)
        #expect(try host.open(client.seal(confirm, kind: 2), kind: 2) == confirm)
        #expect(host.isDerived && client.isDerived)
    }

    @Test func tamperedMessageDoesNotConsumeItsCounter() throws {
        let (host, client) = try pair()
        let amount: [UInt8] = [0, 0, 0, 0, 0, 0, 0x30, 0xA2]
        let message = try host.seal(amount, kind: 1)
        var bytes = message.sealedBox
        // The twentieth byte is in the ciphertext of an eight-byte amount.
        try #require(bytes.count >= 20)
        bytes[19] ^= 1

        #expect(throws: Session.SessionError.unreadable) {
            try client.open(.init(counter: message.counter, sealedBox: bytes), kind: 1)
        }
        #expect(try client.open(message, kind: 1) == amount)
    }

    @Test func replayedConfirmIsRefused() throws {
        let (host, client) = try pair()
        let message = try client.seal([1], kind: 2)
        #expect(try host.open(message, kind: 2) == [1])
        #expect(throws: Session.SessionError.replayed) { try host.open(message, kind: 2) }
    }

    @Test func anotherTransactionCannotOpenTheMessage() throws {
        let (firstHost, _) = try pair()
        let (secondHost, secondClient) = try pair()
        let foreign = try firstHost.seal([42], kind: 1)

        #expect(throws: Session.SessionError.unreadable) { try secondClient.open(foreign, kind: 1) }
        #expect(try secondClient.open(secondHost.seal([7], kind: 1), kind: 1) == [7])
    }

    @Test func closedSessionCannotOpenOrSeal() throws {
        let (host, client) = try pair()
        let message = try client.seal([1], kind: 2)
        host.close()

        #expect(throws: Session.SessionError.closed) { try host.open(message, kind: 2) }
        #expect(throws: Session.SessionError.closed) { try host.seal([7], kind: 1) }
        #expect(host.isClosed)
        #expect(!host.isDerived)
    }

    @Test func reflectedMessageIsRefused() throws {
        let (host, client) = try pair()
        for sender in [host, client] {
            let message = try sender.seal([42], kind: 1)
            #expect(throws: Session.SessionError.unreadable) { try sender.open(message, kind: 1) }
        }
    }

    @Test func changedKindIsRefusedWithoutConsumingCounter() throws {
        let (host, client) = try pair()
        let message = try host.seal([42], kind: 1)
        for kind in UInt8.min...UInt8.max where kind != 1 {
            #expect(throws: Session.SessionError.unreadable) { try client.open(message, kind: kind) }
        }
        #expect(try client.open(message, kind: 1) == [42])
    }

    @Test func invalidPublicKeyLeavesNothingToSeal() throws {
        for bytes in [Array(repeating: UInt8(0), count: 33), [], [2], Array(repeating: 255, count: 65)] {
            let host = Session()
            #expect(throws: Session.SessionError.invalidPublicKey) { try host.derive(peerPublicKey: bytes) }
            #expect(!host.isDerived)
            #expect(throws: Session.SessionError.keyNotDerived) { try host.seal([42], kind: 1) }
        }
    }

    @Test func samePlaintextSealsDifferently() throws {
        let (host, client) = try pair()
        let first = try client.seal([1], kind: 2)
        let second = try client.seal([1], kind: 2)

        #expect(first.sealedBox != second.sealedBox)
        #expect(Array(first.sealedBox.prefix(12)) != Array(second.sealedBox.prefix(12)))
        #expect(first.counter == 0)
        #expect(second.counter == 1)
        #expect(try host.open(first, kind: 2) == [1])
        #expect(try host.open(second, kind: 2) == [1])
    }

    @Test func lowerCounterIsRefused() throws {
        let (host, client) = try pair()
        let messages = try (0...3).map { try host.seal([UInt8($0)], kind: 1) }

        #expect(try client.open(messages[3], kind: 1) == [3])
        #expect(messages[3].counter == 3)
        #expect(throws: Session.SessionError.replayed) { try client.open(messages[2], kind: 1) }
        #expect(try client.open(host.seal([4], kind: 1), kind: 1) == [4])
    }

    @Test func newSessionsHaveFreshKeysAndIDs() throws {
        let first = Session()
        let second = Session()

        #expect(first.publicKey != second.publicKey)
        #expect(first.sessionID != second.sessionID)
        for session in [first, second] {
            #expect(session.publicKey.count == 33)
            #expect(session.sessionID.count == 16)
            let key = try #require(try? P256.KeyAgreement.PublicKey(compressedRepresentation: session.publicKey))
            #expect(Array(key.compressedRepresentation) == session.publicKey)
        }
    }

    @Test func lastCounterSealsThenExhaustionClosesSession() throws {
        let (host, client) = try pair()
        let incoming = try client.seal([1], kind: 2)
        host.lastSealedCounter = UInt32.max - 1
        let last = try host.seal([42], kind: 1)

        #expect(last.counter == .max)
        #expect(try client.open(last, kind: 1) == [42])
        #expect(!host.isClosed)
        #expect(throws: Session.SessionError.closed) { try host.seal([43], kind: 1) }
        #expect(host.isClosed)
        #expect(!host.isDerived)
        #expect(throws: Session.SessionError.closed) { try host.open(incoming, kind: 2) }
    }

    @Test func unkeyedSessionRefusesSealingAndOpening() throws {
        let host = Session()
        #expect(throws: Session.SessionError.keyNotDerived) { try host.seal([], kind: 0) }
        #expect(throws: Session.SessionError.keyNotDerived) {
            try host.open(.init(counter: 0, sealedBox: Array(repeating: 0, count: 28)), kind: 0)
        }
        #expect(!host.isDerived)
        #expect(!host.isClosed)
    }

    @Test func malformedSessionIDIsRefused() {
        for count in [0, 1, 15, 17, 32] {
            #expect(throws: Session.SessionError.invalidSessionID) {
                try Session(sessionID: Array(repeating: 0, count: count))
            }
        }
    }

    @Test func closedSessionCannotBeDerivedAgain() throws {
        let (host, client) = try pair()
        host.close()
        host.close()
        #expect(throws: Session.SessionError.closed) { try host.derive(peerPublicKey: client.publicKey) }
        #expect(host.isClosed)
        #expect(!host.isDerived)

        let fresh = Session()
        fresh.close()
        #expect(throws: Session.SessionError.closed) { try fresh.derive(peerPublicKey: client.publicKey) }
    }

    @Test func derivingAgainCannotResetReplayProtection() throws {
        let (host, client) = try pair()
        let message = try host.seal([42], kind: 1)
        #expect(try client.open(message, kind: 1) == [42])
        #expect(throws: Session.SessionError.alreadyDerived) { try client.derive(peerPublicKey: host.publicKey) }
        #expect(throws: Session.SessionError.replayed) { try client.open(message, kind: 1) }
        #expect(throws: Session.SessionError.alreadyDerived) { try host.derive(peerPublicKey: client.publicKey) }
        let next = try host.seal([43], kind: 1)
        #expect(next.counter == 1)
        #expect(try client.open(next, kind: 1) == [43])
    }

    @Test func damagedBoxesAndCounterDoNotAdvanceReceiver() throws {
        let (host, client) = try pair()
        let message = try host.seal([42], kind: 1)
        for count in 0..<28 {
            #expect(throws: Session.SessionError.unreadable) {
                try client.open(.init(counter: 0, sealedBox: Array(repeating: 0, count: count)), kind: 1)
            }
        }
        for offset in message.sealedBox.indices {
            var bytes = message.sealedBox
            bytes[offset] ^= 1
            #expect(throws: Session.SessionError.unreadable) {
                try client.open(.init(counter: 0, sealedBox: bytes), kind: 1)
            }
        }
        #expect(throws: Session.SessionError.unreadable) {
            try client.open(.init(counter: .max, sealedBox: message.sealedBox), kind: 1)
        }
        #expect(try client.open(message, kind: 1) == [42])
    }

    @Test func sessionIDIsBoundToTheDerivedKey() throws {
        let host = Session()
        var changedID = host.sessionID
        changedID[0] ^= 1
        let client = try Session(sessionID: changedID)
        try host.derive(peerPublicKey: client.publicKey)
        try client.derive(peerPublicKey: host.publicKey)

        #expect(throws: Session.SessionError.unreadable) {
            try client.open(host.seal([42], kind: 1), kind: 1)
        }
    }

    @Test func sealsMatchTheSpecifiedCryptoKitConstruction() throws {
        let peer = P256.KeyAgreement.PrivateKey()
        for direction: UInt8 in [0, 1] {
            let session = direction == 0 ? Session() : try Session(sessionID: Array(0..<16))
            try session.derive(peerPublicKey: Array(peer.publicKey.compressedRepresentation))
            let publicKey = try #require(try? P256.KeyAgreement.PublicKey(compressedRepresentation: session.publicKey))
            let secret = try peer.sharedSecretFromKeyAgreement(with: publicKey)
            let key = secret.hkdfDerivedSymmetricKey(
                using: SHA256.self, salt: session.sessionID,
                sharedInfo: Array("mizan-ble v1".utf8), outputByteCount: 32
            )
            session.lastSealedCounter = 0x01020303
            let sealed = try session.seal([42, 43], kind: 255)
            #expect(sealed.counter == 0x01020304)
            #expect(sealed.sealedBox.count == 30)
            let box = try AES.GCM.SealedBox(combined: sealed.sealedBox)
            let aad = session.sessionID + [direction, 255, 1, 2, 3, 4]
            #expect(Array(try AES.GCM.open(box, using: key, authenticating: aad)) == [42, 43])

            let incomingAAD = session.sessionID + [direction ^ 1, 0, 1, 2, 3, 4]
            let incoming = try AES.GCM.seal(Data(), using: key, authenticating: incomingAAD)
            let bytes = try #require(incoming.combined)
            #expect(try session.open(.init(counter: 0x01020304, sealedBox: Array(bytes)), kind: 0) == [])
            #expect(throws: Session.SessionError.replayed) {
                try session.open(.init(counter: 0x01020304, sealedBox: Array(bytes)), kind: 0)
            }
        }
    }

    private func pair() throws -> (Session, Session) {
        let host = Session()
        let client = try Session(sessionID: host.sessionID)
        try host.derive(peerPublicKey: client.publicKey)
        try client.derive(peerPublicKey: host.publicKey)
        return (host, client)
    }
}
