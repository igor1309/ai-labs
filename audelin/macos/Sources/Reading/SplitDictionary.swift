/// A dictionary kept as a sealed part and a tail, so changing a late key leaves
/// the sealed part's storage shared with earlier copies of the state.
struct SplitDictionary<Key: Hashable & Sendable, Value: Sendable>: Sendable, ExpressibleByDictionaryLiteral {

    private(set) var sealed: [Key: Value] = [:]
    private(set) var tail: [Key: Value] = [:]

    init() {}

    init(uniqueKeysWithValues pairs: some Sequence<(Key, Value)>) {

        tail = .init(uniqueKeysWithValues: pairs)
    }

    init(dictionaryLiteral elements: (Key, Value)...) { self.init(uniqueKeysWithValues: elements) }

    subscript(key: Key) -> Value? {

        get { tail[key] ?? sealed[key] }
        set {
            if sealed[key] != nil {
                sealed[key] = newValue
            } else {
                tail[key] = newValue
            }
        }
    }

    var count: Int { sealed.count + tail.count }

    var values: [Value] { Array(sealed.values) + Array(tail.values) }

    func isSealed(_ key: Key) -> Bool { sealed[key] != nil }

    mutating func seal(_ key: Key) {

        if let value = tail.removeValue(forKey: key) { sealed[key] = value }
    }

    mutating func setSealed(_ key: Key, _ value: Value) { sealed[key] = value }

    mutating func removeAll() { self = .init() }
}

extension SplitDictionary: Equatable where Value: Equatable {

    static func == (lhs: Self, rhs: Self) -> Bool {

        if lhs.sealed.count == rhs.sealed.count { return lhs.tail == rhs.tail && lhs.sealed == rhs.sealed }
        return lhs.tail.count + lhs.sealed.count == rhs.tail.count + rhs.sealed.count
            && lhs.tail.allSatisfy { rhs[$0.key] == $0.value } && lhs.sealed.allSatisfy { rhs[$0.key] == $0.value }
    }
}
