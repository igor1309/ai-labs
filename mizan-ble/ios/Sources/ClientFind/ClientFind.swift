public enum ClientFind {
    public struct Host: Equatable, Sendable {
        public let id: String
        public let name: String?

        public init(id: String, name: String?) {
            self.id = id
            self.name = name
        }
    }

    public enum Bluetooth: Equatable, Sendable {
        case unknown
        case available
        case unavailable(reason: String)
    }

    public enum Answer: Equatable, Sendable {
        case none
        case host(Host)
        case holdCloser
    }

    public enum Selection: Equatable, Sendable {
        case none
        case host(Host)
        case holdCloser
        case gone
    }

    public enum Phase: Equatable, Sendable {
        case idle
        case startingScan
        case scanning
        /// A host means a handover; no host means Bluetooth interrupted scanning.
        case stoppingScan(Host?)
        case handedOver(Host)
    }

    public struct State: Equatable, Sendable {
        public fileprivate(set) var bluetooth: Bluetooth = .unknown
        public fileprivate(set) var selection: Selection = .none
        public fileprivate(set) var phase: Phase = .idle

        /// Waits for the root's first Bluetooth event before requesting a scan.
        public init() {}

        public var isScanning: Bool {
            switch phase {
            case .scanning, .stoppingScan: true
            default: false
            }
        }

        public var canStart: Bool {
            guard bluetooth == .available, phase == .scanning,
                  case .host = selection else { return false }
            return true
        }
    }

    public enum Event: Equatable, Sendable {
        case bluetoothChanged(Bluetooth)
        case pickerAnswered(Answer)
        case start
        case transactionEnded
        case scanningStarted
        case scanningStopped
    }

    public enum Effect: Equatable, Sendable {
        case startScanning
        case stopScanning
    }

    @MainActor public protocol Scanner {
        /// Starting while scanning does nothing.
        func start()
        /// Stopping while stopped does nothing; returns after scanning stops.
        func stop()
    }

    @MainActor public final class EffectHandler {
        private let scanner: any Scanner

        public init(scanner: any Scanner) {
            self.scanner = scanner
        }

        public func handle(_ effect: Effect) -> AsyncStream<Event> {
            AsyncStream { continuation in
                switch effect {
                case .startScanning:
                    scanner.start()
                    continuation.yield(.scanningStarted)
                case .stopScanning:
                    scanner.stop()
                    continuation.yield(.scanningStopped)
                }
                continuation.finish()
            }
        }
    }

    public static func reduce(_ state: State, _ event: Event) -> (State, Effect?) {
        var next = state
        switch event {
        case .bluetoothChanged(let bluetooth):
            next.bluetooth = bluetooth
            switch state.phase {
            case .idle where bluetooth == .available:
                next.selection = .none
                next.phase = .startingScan
                return (next, .startScanning)
            case .scanning where bluetooth != .available:
                next.selection = .none
                next.phase = .stoppingScan(nil)
                return (next, .stopScanning)
            default:
                break
            }

        case .scanningStarted:
            guard state.phase == .startingScan else { return (state, nil) }
            if state.bluetooth == .available {
                next.phase = .scanning
            } else {
                next.phase = .stoppingScan(nil)
                return (next, .stopScanning)
            }

        case .scanningStopped:
            guard case .stoppingScan(let host) = state.phase else { return (state, nil) }
            if let host {
                next.phase = .handedOver(host)
            } else if state.bluetooth == .available {
                next.phase = .startingScan
                return (next, .startScanning)
            } else {
                next.phase = .idle
            }

        case .pickerAnswered(let answer):
            guard state.phase == .scanning else { return (state, nil) }
            switch answer {
            case .host(let host):
                next.selection = .host(host)
            case .holdCloser:
                if state.selection != .gone { next.selection = .holdCloser }
            case .none:
                switch state.selection {
                case .host, .gone: next.selection = .gone
                case .none, .holdCloser: next.selection = .none
                }
            }

        case .start:
            guard state.canStart, case .host(let host) = state.selection else { return (state, nil) }
            next.phase = .stoppingScan(host)
            return (next, .stopScanning)

        case .transactionEnded:
            guard case .handedOver = state.phase else { return (state, nil) }
            next.selection = .none
            if state.bluetooth == .available {
                next.phase = .startingScan
                return (next, .startScanning)
            }
            next.phase = .idle
        }
        return (next, nil)
    }
}
