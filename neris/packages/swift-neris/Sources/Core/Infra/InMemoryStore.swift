import Synchronization

public final class InMemoryStore<Element: Sendable>: @unchecked Sendable {

    private let elements: Mutex<[Element]>

    public init(_ elements: [Element] = []) {
        self.elements = Mutex(elements)
    }

    public func append(_ element: Element) {
        elements.withLock { $0.append(element) }
    }

    public func all() -> [Element] {
        elements.withLock { $0 }
    }
}
