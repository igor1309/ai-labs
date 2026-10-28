public enum AmountEntry {
    public enum Digit: String, CaseIterable, Sendable {
        case zero = "0", one = "1", two = "2", three = "3", four = "4"
        case five = "5", six = "6", seven = "7", eight = "8", nine = "9"
    }

    public enum Key: Equatable, Sendable {
        case digit(Digit)
        case decimalPoint
        case delete
    }

    public enum Bluetooth: Equatable, Sendable {
        case available
        case unavailable(reason: String)
    }

    public enum Event: Equatable, Sendable {
        case key(Key)
        case bluetoothChanged(Bluetooth)
        case clear
    }

    public struct State: Equatable, Sendable {
        /// Keeps the keys exactly as entered; a leading point is drawn with its zero.
        public fileprivate(set) var amount = ""
        public fileprivate(set) var bluetooth: Bluetooth

        public init(bluetooth: Bluetooth) {
            self.bluetooth = bluetooth
        }

        public var canLock: Bool {
            bluetooth == .available && amount.contains { $0 >= "1" && $0 <= "9" }
        }
    }

    /// No effect can be produced; the root can run this on its model.
    public static func reduce(_ state: State, _ event: Event) -> (State, Never?) {
        var next = state
        switch event {
        case .bluetoothChanged(let bluetooth):
            next.bluetooth = bluetooth
        case .clear:
            next.amount = ""
        case .key(let key):
            switch key {
            case .digit(let digit):
                if next.amount == "0" {
                    next.amount = digit.rawValue
                } else if let point = next.amount.firstIndex(of: ".") {
                    let decimals = next.amount.distance(from: point, to: next.amount.endIndex) - 1
                    if decimals < 2 { next.amount += digit.rawValue }
                } else if next.amount.count < 6 {
                    next.amount += digit.rawValue
                }
            case .decimalPoint:
                if !next.amount.contains(".") { next.amount += "." }
            case .delete:
                if !next.amount.isEmpty { next.amount.removeLast() }
            }
        }
        return (next, nil)
    }
}
