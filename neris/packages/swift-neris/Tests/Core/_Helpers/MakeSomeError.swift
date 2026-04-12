import Foundation

func makeSomeError(
    domain: String = makeSomeString()
) -> Error {
    NSError(domain: domain, code: 0)
}
