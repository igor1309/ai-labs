public enum MessageCodec {
    public enum Kind: UInt8, CaseIterable, Sendable {
        case amount = 1, decision = 2, acknowledgement = 3, result = 4, end = 5
    }

    public enum Decision: UInt8, CaseIterable, Sendable {
        case confirm = 1, decline = 2
    }

    public enum Outcome: UInt8, CaseIterable, Sendable {
        case success = 1, failure = 2
    }

    public enum Message: Equatable, Sendable {
        /// Whole minor units (hundredths), without decimal conversion.
        case amount(UInt64)
        case decision(Decision)
        case acknowledgement(Kind)
        case result(Outcome)
        case end
    }

    public struct Session: Equatable, Sendable {
        public let publicKey: [UInt8]
        public let sessionID: [UInt8]

        public init(publicKey: [UInt8], sessionID: [UInt8]) {
            self.publicKey = publicKey
            self.sessionID = sessionID
        }
    }

    public struct Frame: Equatable, Sendable {
        public let kind: Kind
        public let counter: UInt32
        public let sealedBox: [UInt8]

        public init(kind: Kind, counter: UInt32, sealedBox: [UInt8]) {
            self.kind = kind
            self.counter = counter
            self.sealedBox = sealedBox
        }
    }

    public enum CodecError: Error {
        case unreadable
    }

    public static func encodeSession(_ session: Session) throws -> [UInt8] {
        guard session.publicKey.count == 33, session.sessionID.count == 16 else {
            throw CodecError.unreadable
        }
        return [1] + session.publicKey + session.sessionID
    }

    public static func decodeSession(_ bytes: [UInt8]) throws -> Session {
        guard bytes.count == 50, bytes[0] == 1 else { throw CodecError.unreadable }
        return Session(publicKey: Array(bytes[1..<34]), sessionID: Array(bytes[34..<50]))
    }

    public static func encodeFrame(_ frame: Frame) throws -> [UInt8] {
        // The box is opaque; only space for its nonce and tag is required here.
        guard frame.sealedBox.count >= 28 else { throw CodecError.unreadable }
        return [frame.kind.rawValue] + bigEndian(frame.counter) + frame.sealedBox
    }

    public static func decodeFrame(_ bytes: [UInt8]) throws -> Frame {
        guard bytes.count >= 33, let kind = Kind(rawValue: bytes[0]) else {
            throw CodecError.unreadable
        }
        let counter: UInt32 = integer(bytes[1..<5])
        return Frame(kind: kind, counter: counter, sealedBox: Array(bytes.dropFirst(5)))
    }

    public static func encodeBody(_ message: Message) -> [UInt8] {
        switch message {
        case .amount(let minorUnits): bigEndian(minorUnits)
        case .decision(let decision): [decision.rawValue]
        case .acknowledgement(let kind): [kind.rawValue]
        case .result(let outcome): [outcome.rawValue]
        case .end: []
        }
    }

    public static func decodeBody(_ bytes: [UInt8], kind: Kind) throws -> Message {
        switch kind {
        case .amount:
            guard bytes.count == 8 else { throw CodecError.unreadable }
            return .amount(integer(bytes[...]))
        case .decision:
            guard bytes.count == 1, let decision = Decision(rawValue: bytes[0]) else {
                throw CodecError.unreadable
            }
            return .decision(decision)
        case .acknowledgement:
            guard bytes.count == 1, let acknowledged = Kind(rawValue: bytes[0]) else {
                throw CodecError.unreadable
            }
            return .acknowledgement(acknowledged)
        case .result:
            guard bytes.count == 1, let outcome = Outcome(rawValue: bytes[0]) else {
                throw CodecError.unreadable
            }
            return .result(outcome)
        case .end:
            guard bytes.isEmpty else { throw CodecError.unreadable }
            return .end
        }
    }

    private static func bigEndian<T: FixedWidthInteger & UnsignedInteger>(_ value: T) -> [UInt8] {
        stride(from: T.bitWidth - 8, through: 0, by: -8).map {
            UInt8(truncatingIfNeeded: value >> $0)
        }
    }

    private static func integer<T: FixedWidthInteger & UnsignedInteger>(_ bytes: ArraySlice<UInt8>) -> T {
        bytes.reduce(0) { ($0 << 8) | T($1) }
    }
}
