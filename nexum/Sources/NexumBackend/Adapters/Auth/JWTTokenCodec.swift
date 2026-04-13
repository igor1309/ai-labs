import CryptoKit
import Foundation

struct JWTTokenCodec: Sendable {

    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private let secret: String

    init(secret: String) {
        self.secret = secret
        self.decoder = JSONDecoder()
        self.encoder = JSONEncoder()
    }

    func sign(claims: JWTClaims) throws -> String {
        let headerData = try encoder.encode(JWTHeader.hs256)
        let payloadData = try encoder.encode(claims)

        let encodedHeader = base64urlEncode(headerData)
        let encodedPayload = base64urlEncode(payloadData)
        let signingInput = "\(encodedHeader).\(encodedPayload)"
        let signature = try computeSignature(for: signingInput)

        return "\(signingInput).\(signature)"
    }

    func verify(_ token: String) throws -> JWTClaims {
        let parts = token.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 3 else {
            throw AuthError.invalidToken
        }

        let encodedHeader = String(parts[0])
        let encodedPayload = String(parts[1])
        let encodedSignature = String(parts[2])

        let signingInput = "\(encodedHeader).\(encodedPayload)"
        let expectedSignature = try computeSignature(for: signingInput)

        guard secureEquals(expectedSignature, encodedSignature) else {
            throw AuthError.invalidToken
        }

        let payloadData = try base64urlDecode(encodedPayload)
        let claims = try decoder.decode(JWTClaims.self, from: payloadData)
        return claims
    }

    private func computeSignature(for input: String) throws -> String {
        guard let inputData = input.data(using: .utf8) else {
            throw AuthError.invalidToken
        }

        let key = SymmetricKey(data: Data(secret.utf8))
        let digest = HMAC<SHA256>.authenticationCode(for: inputData, using: key)
        return base64urlEncode(Data(digest))
    }

    private func base64urlDecode(_ string: String) throws -> Data {
        var base64 = string.replacingOccurrences(of: "-", with: "+")
        base64 = base64.replacingOccurrences(of: "_", with: "/")

        let padding = (4 - (base64.count % 4)) % 4
        if padding > 0 {
            base64 += String(repeating: "=", count: padding)
        }

        guard let data = Data(base64Encoded: base64) else {
            throw AuthError.invalidToken
        }

        return data
    }

    private func base64urlEncode(_ data: Data) -> String {
        data
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private func secureEquals(_ left: String, _ right: String) -> Bool {
        let leftBytes = Array(left.utf8)
        let rightBytes = Array(right.utf8)

        guard leftBytes.count == rightBytes.count else {
            return false
        }

        var diff: UInt8 = 0
        for index in 0..<leftBytes.count {
            diff |= leftBytes[index] ^ rightBytes[index]
        }
        return diff == 0
    }
}
