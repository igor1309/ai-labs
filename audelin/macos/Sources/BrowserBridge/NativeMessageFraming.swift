import Foundation

/// Chrome's native messaging framing: each message is its length as a 32-bit
/// integer in native byte order (little-endian on every Mac), then that many bytes of UTF-8 JSON. Chrome
/// accepts at most 1 MB from the host and sends at most 64 MB to it.
public enum NativeMessageFraming {
    public static let maximumToBrowser = 1_024 * 1_024
    public static let maximumFromBrowser = 64 * 1_024 * 1_024

    public enum Failure: Error, Equatable {
        /// A message is longer than its direction allows.
        case tooLong(Int)
    }

    /// Frames one message for the browser.
    public static func encode(_ message: Data) throws -> Data {
        guard message.count <= maximumToBrowser else { throw Failure.tooLong(message.count) }
        var length = UInt32(message.count).littleEndian
        var framed = Data(bytes: &length, count: 4)
        framed.append(message)
        return framed
    }

    /// Reads the whole messages `buffer` holds from the browser; `rest` is the
    /// start of an incomplete one, to be prefixed to the next bytes read.
    public static func decode(_ buffer: Data) throws -> (messages: [Data], rest: Data) {
        var messages: [Data] = []
        var index = buffer.startIndex
        while buffer.endIndex - index >= 4 {
            let length = buffer[index..<index + 4].reversed().reduce(0) { $0 << 8 | Int($1) }
            guard length <= maximumFromBrowser else { throw Failure.tooLong(length) }
            guard buffer.endIndex - index - 4 >= length else { break }
            messages.append(Data(buffer[index + 4..<index + 4 + length]))
            index += 4 + length
        }
        return (messages, Data(buffer[index...]))
    }
}
