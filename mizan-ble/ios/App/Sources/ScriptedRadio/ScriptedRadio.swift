import Foundation
import Root
import ScriptedSettings
import SessionCrypto
import MessageCodec

@MainActor protocol SettingsSource: AnyObject {
    func current() -> SettingsResult
    var updates: AsyncStream<SettingsResult> { get }
}
extension SettingsLoader: SettingsSource {}

@MainActor protocol ScheduledStep: AnyObject { func cancel() }
@MainActor protocol RadioClock: AnyObject {
    var now: Double { get }
    func schedule(after seconds: Double, _ action: @escaping @MainActor () -> Void) -> any ScheduledStep
}

@MainActor final class PendingSteps {
    private var steps: [any ScheduledStep] = []
    func add(_ step: any ScheduledStep) { steps.append(step) }
    func cancel() { steps.forEach { $0.cancel() }; steps.removeAll() }
    isolated deinit { cancel() }
}

extension SettingsResult {
    var settings: Settings? { if case .valid(let value) = self { value } else { nil } }
    var hostState: HostBluetoothState {
        switch settings?.bluetooth {
        case .on: .poweredOn
        case .off: .poweredOff
        case .notAllowed: .unauthorized
        case nil: .unsupported
        }
    }
    var clientState: ClientBluetoothState {
        switch settings?.bluetooth {
        case .on: .on
        case .off: .off
        case .notAllowed: .notAllowed
        case nil: .unsupported
        }
    }
}

// Both roles use the shipping wire format and session protection.
enum Wire {
    static func seal(_ message: MessageCodec.Message, with crypto: SessionCrypto) throws -> [UInt8] {
        let kind: MessageCodec.Kind = switch message {
        case .amount: .amount
        case .decision: .decision
        case .acknowledgement: .acknowledgement
        case .result: .result
        case .end: .end
        }
        let sealed = try crypto.seal(MessageCodec.encodeBody(message), kind: kind.rawValue)
        return try MessageCodec.encodeFrame(.init(kind: kind, counter: sealed.counter, sealedBox: sealed.sealedBox))
    }
    static func open(_ bytes: [UInt8], with crypto: SessionCrypto) throws -> MessageCodec.Message {
        let frame = try MessageCodec.decodeFrame(bytes)
        let body = try crypto.open(.init(counter: frame.counter, sealedBox: frame.sealedBox), kind: frame.kind.rawValue)
        return try MessageCodec.decodeBody(body, kind: frame.kind)
    }
}
