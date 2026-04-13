import Foundation

struct JWTClaims: Codable, Equatable, Sendable {

    let exp: Int
    let sub: String
}

struct JWTHeader: Codable, Equatable, Sendable {

    let alg: String
    let typ: String

    static var hs256: JWTHeader {
        JWTHeader(alg: "HS256", typ: "JWT")
    }
}
