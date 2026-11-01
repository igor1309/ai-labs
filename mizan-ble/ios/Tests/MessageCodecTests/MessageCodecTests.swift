import MessageCodec
import Testing

private typealias Codec = MessageCodec

struct MessageCodecTests {
    @Test func sessionRoundTrip() throws {
        let key = [UInt8(2)] + Array(UInt8(1)...UInt8(32))
        let id = Array(UInt8(128)...UInt8(143))
        let session = Codec.Session(publicKey: key, sessionID: id)
        let fixture = [UInt8(1)] + key + id

        #expect(try Codec.encodeSession(session) == fixture)
        #expect(fixture.count == 50)
        #expect(try Codec.decodeSession(fixture) == session)
    }

    @Test func frameRoundTrip() throws {
        let box = Array(UInt8(0)...UInt8(36))
        let frame = Codec.Frame(kind: .amount, counter: 7, sealedBox: box)
        let fixture = [UInt8(1), 0, 0, 0, 7] + box

        #expect(try Codec.encodeFrame(frame) == fixture)
        #expect(try Codec.decodeFrame(fixture) == frame)
    }

    @Test func amountRoundTrip() throws {
        let cases: [(UInt64, [UInt8])] = [
            (12450, [0, 0, 0, 0, 0, 0, 0x30, 0xA2]),
            (0, [0, 0, 0, 0, 0, 0, 0, 0]),
            (0x0102030405060708, [1, 2, 3, 4, 5, 6, 7, 8]),
            (.max, Array(repeating: 255, count: 8)),
        ]
        for (minorUnits, fixture) in cases {
            #expect(Codec.encodeBody(.amount(minorUnits)) == fixture)
            #expect(try Codec.decodeBody(fixture, kind: .amount) == .amount(minorUnits))
        }
    }

    @Test func decisionRoundTrip() throws {
        for (decision, byte): (Codec.Decision, UInt8) in [(.confirm, 1), (.decline, 2)] {
            #expect(Codec.encodeBody(.decision(decision)) == [byte])
            #expect(try Codec.decodeBody([byte], kind: .decision) == .decision(decision))
        }
    }

    @Test func resultRoundTrip() throws {
        for (outcome, byte): (Codec.Outcome, UInt8) in [(.failure, 2), (.success, 1)] {
            #expect(Codec.encodeBody(.result(outcome)) == [byte])
            #expect(try Codec.decodeBody([byte], kind: .result) == .result(outcome))
        }
    }

    @Test func acknowledgementRoundTrip() throws {
        let cases: [(Codec.Kind, UInt8)] = [
            (.decision, 2), (.amount, 1), (.acknowledgement, 3), (.result, 4), (.end, 5),
        ]
        for (kind, byte) in cases {
            #expect(Codec.encodeBody(.acknowledgement(kind)) == [byte])
            #expect(try Codec.decodeBody([byte], kind: .acknowledgement) == .acknowledgement(kind))
        }
    }

    @Test func shortFrameIsUnreadable() {
        #expect(throws: Codec.CodecError.unreadable) {
            try Codec.decodeFrame([1, 0, 0, 0])
        }
        for count in 0..<33 {
            #expect(throws: Codec.CodecError.unreadable) {
                try Codec.decodeFrame(Array(repeating: 1, count: count))
            }
        }
    }

    @Test func unknownFrameKindIsUnreadable() {
        for byte in [UInt8(9), 0] + Array(UInt8(6)...UInt8.max) {
            #expect(throws: Codec.CodecError.unreadable) {
                try Codec.decodeFrame([byte, 0, 0, 0, 7] + Array(repeating: 0, count: 28))
            }
        }
    }

    @Test func otherSessionVersionIsUnreadable() {
        for version in [UInt8(2), 0] + Array(UInt8(3)...UInt8.max) {
            #expect(throws: Codec.CodecError.unreadable) {
                try Codec.decodeSession([version] + Array(repeating: 0, count: 49))
            }
        }
    }

    @Test func unknownDecisionValueIsUnreadable() {
        for byte in [UInt8(3), 0] + Array(UInt8(4)...UInt8.max) {
            #expect(throws: Codec.CodecError.unreadable) {
                try Codec.decodeBody([byte], kind: .decision)
            }
        }
    }

    @Test func wrongSessionLengthsAreUnreadable() {
        for count in [0, 1, 33, 49, 51, 100] {
            #expect(throws: Codec.CodecError.unreadable) {
                try Codec.decodeSession(Array(repeating: 1, count: count))
            }
        }
        for (keyCount, idCount) in [(32, 16), (34, 16), (33, 15), (33, 17), (0, 0)] {
            #expect(throws: Codec.CodecError.unreadable) {
                try Codec.encodeSession(.init(
                    publicKey: Array(repeating: 2, count: keyCount),
                    sessionID: Array(repeating: 0, count: idCount)
                ))
            }
        }
    }

    @Test func wrongBodyLengthsAreUnreadable() {
        for kind in Codec.Kind.allCases {
            let validCount = kind == .amount ? 8 : kind == .end ? 0 : 1
            for count in [0, 1, 2, 7, 8, 9, 16] where count != validCount {
                #expect(throws: Codec.CodecError.unreadable) {
                    try Codec.decodeBody(Array(repeating: 1, count: count), kind: kind)
                }
            }
        }
    }

    @Test func unknownResultAndAcknowledgementValuesAreUnreadable() {
        for byte in UInt8.min...UInt8.max {
            if byte != 1 && byte != 2 {
                #expect(throws: Codec.CodecError.unreadable) {
                    try Codec.decodeBody([byte], kind: .result)
                }
            }
            if !(1...5).contains(byte) {
                #expect(throws: Codec.CodecError.unreadable) {
                    try Codec.decodeBody([byte], kind: .acknowledgement)
                }
            }
        }
    }

    @Test func endHasAnEmptyBody() throws {
        #expect(Codec.encodeBody(.end) == [])
        #expect(try Codec.decodeBody([], kind: .end) == .end)
        let frame = Codec.Frame(kind: .end, counter: 0, sealedBox: Array(repeating: 0, count: 28))
        let fixture = [UInt8(5), 0, 0, 0, 0] + frame.sealedBox
        #expect(try Codec.encodeFrame(frame) == fixture)
        #expect(try Codec.decodeFrame(fixture) == frame)
    }

    @Test func frameCountersAndKindsKeepTheirBytes() throws {
        for (kind, byte): (Codec.Kind, UInt8) in [
            (.amount, 1), (.decision, 2), (.acknowledgement, 3), (.result, 4), (.end, 5),
        ] {
            for (counter, bytes): (UInt32, [UInt8]) in [
                (0, [0, 0, 0, 0]), (0x01020304, [1, 2, 3, 4]), (.max, [255, 255, 255, 255]),
            ] {
                let box = Array(UInt8(128)...UInt8(163))
                let frame = Codec.Frame(kind: kind, counter: counter, sealedBox: box)
                let fixture = [byte] + bytes + box
                #expect(try Codec.encodeFrame(frame) == fixture)
                #expect(try Codec.decodeFrame(fixture) == frame)
            }
        }
    }

    @Test func shortSealedBoxCannotBeFramed() {
        for count in 0..<28 {
            #expect(throws: Codec.CodecError.unreadable) {
                try Codec.encodeFrame(.init(
                    kind: .amount, counter: 7, sealedBox: Array(repeating: 0, count: count)
                ))
            }
        }
    }
}
