import CryptoKit
import Foundation

/// One transaction, confined to its caller's isolation domain.
public final class SessionCrypto {
    public struct SealedMessage: Equatable, Sendable {
        public let counter: UInt32
        public let sealedBox: [UInt8]

        public init(counter: UInt32, sealedBox: [UInt8]) {
            self.counter = counter
            self.sealedBox = sealedBox
        }
    }

    public enum SessionError: Error, Equatable {
        case closed, keyNotDerived, alreadyDerived, invalidPublicKey, invalidSessionID
        case unreadable, replayed
    }

    public let sessionID: [UInt8]
    public let publicKey: [UInt8]
    public private(set) var isClosed = false
    public var isDerived: Bool { key != nil }

    // Internal so tests can reach exhaustion without sealing billions of messages.
    var lastSealedCounter: UInt32?
    private var lastOpenedCounter: UInt32?
    private let outgoingDirection: UInt8
    private var privateKey: P256.KeyAgreement.PrivateKey?
    private var key: SymmetricKey?

    /// Makes a host session with its own fresh session id.
    public convenience init() {
        let id = SymmetricKey(size: .bits128).withUnsafeBytes { Array($0) }
        self.init(sessionID: id, outgoingDirection: 0)
    }

    /// Makes a client session using the id read from the host.
    public convenience init(sessionID: [UInt8]) throws {
        guard sessionID.count == 16 else { throw SessionError.invalidSessionID }
        self.init(sessionID: sessionID, outgoingDirection: 1)
    }

    private init(sessionID: [UInt8], outgoingDirection: UInt8) {
        let privateKey = P256.KeyAgreement.PrivateKey()
        self.privateKey = privateKey
        publicKey = Array(privateKey.publicKey.compressedRepresentation)
        self.sessionID = sessionID
        self.outgoingDirection = outgoingDirection
    }

    public func derive(peerPublicKey: [UInt8]) throws {
        guard !isClosed else { throw SessionError.closed }
        guard key == nil else { throw SessionError.alreadyDerived }
        guard peerPublicKey.count == 33,
              let peer = try? P256.KeyAgreement.PublicKey(compressedRepresentation: peerPublicKey) else {
            throw SessionError.invalidPublicKey
        }
        guard let privateKey else { throw SessionError.closed }
        let secret = try privateKey.sharedSecretFromKeyAgreement(with: peer)
        key = secret.hkdfDerivedSymmetricKey(
            using: SHA256.self, salt: sessionID,
            sharedInfo: Array("mizan-ble v1".utf8), outputByteCount: 32
        )
        self.privateKey = nil
    }

    public func seal(_ plaintext: [UInt8], kind: UInt8) throws -> SealedMessage {
        let key = try derivedKey()
        guard lastSealedCounter != UInt32.max else {
            close()
            throw SessionError.closed
        }
        let counter = lastSealedCounter.map { $0 + 1 } ?? 0
        let box = try AES.GCM.seal(
            plaintext, using: key, nonce: AES.GCM.Nonce(),
            authenticating: authenticatedData(direction: outgoingDirection, kind: kind, counter: counter)
        )
        guard let bytes = box.combined else { throw SessionError.unreadable }
        lastSealedCounter = counter
        return SealedMessage(counter: counter, sealedBox: Array(bytes))
    }

    public func open(_ message: SealedMessage, kind: UInt8) throws -> [UInt8] {
        let key = try derivedKey()
        if let lastOpenedCounter, message.counter <= lastOpenedCounter {
            throw SessionError.replayed
        }
        let plaintext: Data
        do {
            let box = try AES.GCM.SealedBox(combined: message.sealedBox)
            plaintext = try AES.GCM.open(
                box, using: key,
                authenticating: authenticatedData(
                    direction: outgoingDirection ^ 1, kind: kind, counter: message.counter
                )
            )
        } catch {
            throw SessionError.unreadable
        }
        lastOpenedCounter = message.counter
        return Array(plaintext)
    }

    public func close() {
        isClosed = true
        key = nil
        privateKey = nil
    }

    private func derivedKey() throws -> SymmetricKey {
        guard !isClosed else { throw SessionError.closed }
        guard let key else { throw SessionError.keyNotDerived }
        return key
    }

    private func authenticatedData(direction: UInt8, kind: UInt8, counter: UInt32) -> [UInt8] {
        sessionID + [direction, kind] + [24, 16, 8, 0].map {
            UInt8(truncatingIfNeeded: counter >> $0)
        }
    }
}
