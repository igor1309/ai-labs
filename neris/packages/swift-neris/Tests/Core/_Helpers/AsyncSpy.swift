final class AsyncSpy<Payload, Response, Failure: Error>: @unchecked Sendable {

    private(set) var payloads = [Payload]()
    private var stubs: [Stub]

    init(stubs: [Stub] = []) {

        self.stubs = stubs
    }

    typealias Stub = Result<Response, Failure>
}

typealias AsyncSpyOf<Payload, Response> = AsyncSpy<Payload, Response, Error>

extension AsyncSpy {

    var callCount: Int { payloads.count }

    func call(payload: Payload) async throws -> Response {

        try? await Task.sleep(for: .milliseconds(100))
        payloads.append(payload)
        return try stubs.removeFirst().get()
    }
}

extension AsyncSpy where Payload == Void {

    func call() async throws -> Response {

        return try await self.call(payload: ())
    }
}

extension AsyncSpy where Response == Void {

    convenience init() {

        self.init(stubs: Array(repeating: .success(()), count: 100))
    }
}

extension AsyncSpy {

    func call<A, B>(_ a: A, _ b: B) async throws -> Response
    where Payload == (A, B) {

        return try await self.call(payload: (a, b))
    }

    func call<A, B, C>(_ a: A, _ b: B, _ c: C) async throws -> Response
    where Payload == (A, B, C) {

        return try await self.call(payload: (a, b, c))
    }
}

extension AsyncSpy where Response == Result<Void, Error> {

    func call(payload: Payload) async throws -> Void {

        return try await call(payload: payload).get()
    }

    func call<A, B>(_ a: A, _ b: B) async throws -> Void
    where Payload == (A, B) {

        return try await self.call(payload: (a, b))
    }
}

extension AsyncSpy where Failure == Never, Response == Void {

    func callNoThrow(payload: Payload) async {
        try! await self.call(payload: payload)
    }

    func callNoThrow<A, B>(_ a: A, _ b: B) async
    where Payload == (A, B) {
        await callNoThrow(payload: (a, b))
    }
}
