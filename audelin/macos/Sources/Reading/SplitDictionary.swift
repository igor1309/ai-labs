/// A dictionary kept as a sealed part and a tail, so changing a late key leaves
/// the sealed part's storage shared with earlier copies of the state.
public struct SplitDictionary<Key: Hashable & Sendable, Value: Sendable>: Sendable, ExpressibleByDictionaryLiteral {

    public var sealed: [Key: Value] = [:]
    public var tail: [Key: Value] = [:]

    public init() {}

    public init(sealed: [Key: Value], tail: [Key: Value] = [:]) {

        self.sealed = sealed
        self.tail = tail
    }

    public init(uniqueKeysWithValues pairs: some Sequence<(Key, Value)>) {

        tail = .init(uniqueKeysWithValues: pairs)
    }

    public init(dictionaryLiteral elements: (Key, Value)...) { self.init(uniqueKeysWithValues: elements) }

    public subscript(key: Key) -> Value? {

        get { tail[key] ?? sealed[key] }
        set {
            if sealed[key] != nil {
                sealed[key] = newValue
            } else {
                tail[key] = newValue
            }
        }
    }

    public var count: Int { sealed.count + tail.count }

    public var values: [Value] { Array(sealed.values) + Array(tail.values) }

    public func isSealed(_ key: Key) -> Bool { sealed[key] != nil }

    public mutating func seal(_ key: Key) {

        if let value = tail.removeValue(forKey: key) { sealed[key] = value }
    }

    public mutating func setSealed(_ key: Key, _ value: Value) { sealed[key] = value }

    public mutating func removeAll() { self = .init() }

    public mutating func removeTail() { tail.removeAll(keepingCapacity: true) }
}

extension SplitDictionary: Equatable where Value: Equatable {

    public static func == (lhs: Self, rhs: Self) -> Bool {

        if lhs.sealed.count == rhs.sealed.count { return lhs.tail == rhs.tail && lhs.sealed == rhs.sealed }
        return lhs.tail.count + lhs.sealed.count == rhs.tail.count + rhs.sealed.count
            && lhs.tail.allSatisfy { rhs[$0.key] == $0.value } && lhs.sealed.allSatisfy { rhs[$0.key] == $0.value }
    }
}
