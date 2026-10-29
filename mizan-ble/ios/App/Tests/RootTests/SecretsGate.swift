import Foundation
import Testing
@testable import Root

struct SecretsGate {
    let amount = "987654321.23"
    let key = Array(UInt8(161)...UInt8(192))
    let nonce = Array(UInt8(201)...UInt8(212))
    let frame = Array(UInt8(65)...UInt8(96))
    let session = UUID(uuidString: "8F4B6E9C-3D71-42A5-B620-971E5CDA803F")!
    let peer = UUID(uuidString: "9A2E7D6B-5C84-41F3-A109-6DEB732CF850")!

    func assertAbsent(from entries: [LogEntry], sourceLocation: SourceLocation = #_sourceLocation) {
        let text = entries.map { "\($0.category.rawValue) \($0.message) \($0.error ?? "")" }.joined(separator: "\n")
        let strings = [amount, session.uuidString, peer.uuidString]
        let bytes = [key, nonce, frame] + strings.map { Array($0.utf8) }
        var forbidden = strings.flatMap { [$0, $0.lowercased(), $0.uppercased()] }
        for value in bytes {
            forbidden += [
                value.map { String($0) }.joined(),
                value.map { String($0) }.joined(separator: ", "),
                value.map { String(format: "%02x", $0) }.joined(),
                value.map { String(format: "%02X", $0) }.joined(),
                Data(value).base64EncodedString(),
                String(describing: value), String(describing: Data(value)),
            ]
        }
        for secret in forbidden {
            #expect(!text.contains(secret), "Log contains secret representation: \(secret)", sourceLocation: sourceLocation)
        }
    }
}
