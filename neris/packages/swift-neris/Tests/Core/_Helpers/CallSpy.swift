final class CallSpy<Payload, Response> {

    private(set) var payloads = [Payload]()
    private var stubs: [Response]

    init(stubs: [Response] = []) {

        self.stubs = stubs
    }
}

extension CallSpy {

    var callCount: Int { payloads.count }

    func call(payload: Payload) -> Response {

        payloads.append(payload)
        return stubs.removeFirst()
    }
}

extension CallSpy where Payload == Void {

    func call() -> Response {

        self.call(payload: ())
    }
}

extension CallSpy where Response == Void {

    convenience init() {

        self.init(stubs: [()])
    }
}

extension CallSpy {

    func call<A, B>(_ a: A, _ b: B) -> Response
    where Payload == (A, B) {

        self.call(payload: (a, b))
    }

    func call<A, B, C>(_ a: A, _ b: B, _ c: C) -> Response
    where Payload == (A, B, C) {

        self.call(payload: (a, b, c))
    }
}

extension CallSpy {

    func call<T>(_ payload: Payload) throws -> T where Response == Result<T, Error> {

        return try call(payload: payload).get()
    }

    func call<A, B, T>(_ a: A, _ b: B) throws -> T
    where Payload == (A, B), Response == Result<T, Error> {

        return try self.call((a, b))
    }
}
