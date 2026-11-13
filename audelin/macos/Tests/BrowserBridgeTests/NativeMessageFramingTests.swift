import BrowserBridge
import Foundation
import Testing

@Suite struct NativeMessageFramingTests {
    @Test func framesAMessageWithItsLittleEndianLength() throws {
        #expect(try NativeMessageFraming.encode(Data(#"{"a":1}"#.utf8)) == Data([7, 0, 0, 0]) + Data(#"{"a":1}"#.utf8))
    }

    @Test func framesAnEmptyMessage() throws {
        #expect(try NativeMessageFraming.encode(Data()) == Data([0, 0, 0, 0]))
    }

    @Test func refusesAMessageOverTheBrowsersLimit() {
        let size = NativeMessageFraming.maximumToBrowser + 1
        #expect(throws: NativeMessageFraming.Failure.tooLong(size)) {
            try NativeMessageFraming.encode(Data(count: size))
        }
        #expect(throws: Never.self) { try NativeMessageFraming.encode(Data(count: size - 1)) }
    }

    @Test func readsOneMessage() throws {
        let decoded = try NativeMessageFraming.decode(frame("one"))
        #expect(decoded.messages == [Data("one".utf8)] && decoded.rest.isEmpty)
    }

    @Test func readsSeveralMessagesInOrder() throws {
        let decoded = try NativeMessageFraming.decode(frame("one") + frame("") + frame("three"))
        #expect(decoded.messages == [Data("one".utf8), Data(), Data("three".utf8)] && decoded.rest.isEmpty)
    }

    @Test func keepsAMessageSplitAcrossReads() throws {
        let bytes = frame("one") + frame("second")
        let first = try NativeMessageFraming.decode(bytes.prefix(9))
        #expect(first.messages == [Data("one".utf8)] && first.rest == bytes.dropFirst(7).prefix(2))
        let second = try NativeMessageFraming.decode(first.rest + bytes.dropFirst(9))
        #expect(second.messages == [Data("second".utf8)] && second.rest.isEmpty)
    }

    @Test func keepsAPartialLength() throws {
        let decoded = try NativeMessageFraming.decode(Data([3, 0]))
        #expect(decoded.messages.isEmpty && decoded.rest == Data([3, 0]))
    }

    @Test func refusesALengthOverTheHostsLimit() {
        let size = NativeMessageFraming.maximumFromBrowser + 1
        let length = withUnsafeBytes(of: UInt32(size).littleEndian) { Data($0) }
        #expect(throws: NativeMessageFraming.Failure.tooLong(size)) { try NativeMessageFraming.decode(length) }
    }

    private func frame(_ text: String) -> Data {
        withUnsafeBytes(of: UInt32(text.utf8.count).littleEndian) { Data($0) } + Data(text.utf8)
    }
}
