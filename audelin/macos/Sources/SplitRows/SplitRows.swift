/// A list kept as a sealed part and a tail. Changing the tail leaves the sealed
/// part's storage shared with earlier copies, so a late change does not copy the
/// whole list and two copies compare in the size of their tails.
@frozen public struct SplitRows<Element> {

    // Inlinable, because panel and view code reads rows across this module's edge.
    public internal(set) var sealed: [Element]
    public internal(set) var tail: [Element]

    public init(sealed: [Element] = [], tail: [Element] = []) {

        self.sealed = sealed
        self.tail = tail
    }

    /// Moves the leading elements up to `count` into the sealed part.
    public mutating func seal(upTo count: Int) {

        let moved = Swift.min(count - sealed.count, tail.count)
        guard moved > 0 else { return }
        sealed.append(contentsOf: tail[..<moved])
        tail.removeFirst(moved)
    }
}

extension SplitRows: RandomAccessCollection, MutableCollection, RangeReplaceableCollection {

    public init() { self.init(sealed: [], tail: []) }

    @inlinable public var startIndex: Int { 0 }
    @inlinable public var endIndex: Int { sealed.count + tail.count }

    public subscript(position: Int) -> Element {

        @inlinable get { position < sealed.count ? sealed[position] : tail[position - sealed.count] }
        set {
            if position < sealed.count { sealed[position] = newValue } else { tail[position - sealed.count] = newValue }
        }
    }

    public mutating func replaceSubrange(_ range: Range<Int>, with elements: some Collection<Element>) {

        if range.lowerBound >= sealed.count {
            tail.replaceSubrange((range.lowerBound - sealed.count)..<(range.upperBound - sealed.count), with: elements)
        } else {
            var whole = Array(self)
            whole.replaceSubrange(range, with: elements)
            self = .init(sealed: [], tail: whole)
        }
    }
}

extension SplitRows: ExpressibleByArrayLiteral {

    public init(arrayLiteral elements: Element...) { self.init(sealed: [], tail: elements) }
}

extension SplitRows: Equatable where Element: Equatable {

    @inlinable public static func == (lhs: Self, rhs: Self) -> Bool {

        if lhs.sealed.count == rhs.sealed.count { return lhs.tail == rhs.tail && lhs.sealed == rhs.sealed }
        return lhs.elementsEqual(rhs)
    }
}

extension SplitRows: Sendable where Element: Sendable {}
