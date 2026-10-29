import DesignSystem
import ModeSwitchUI
import Observation

public typealias Side = DesignSystem.Side

public struct AppModeState: Equatable, Sendable, LogDescribable {
    public var side: Side
    public var isAtRest: Bool
    public var logDescription: String { "\(side.logName) \(isAtRest ? "atRest" : "busy")" }
}

@MainActor @Observable public final class AppRoot {
    public let radios: RadioPair
    public private(set) var state: AppModeState
    private let modeLog: ModeLog

    /// Flow wiring supplies whether the current mode holds a session or a link.
    public var isAtRest: Bool {
        get { state.isAtRest }
        set {
            guard newValue != state.isAtRest else { return }
            state.isAtRest = newValue
            modeLog.state(state)
        }
    }

    public var modeSwitchState: ModeSwitchState { .init(side: state.side, isEnabled: isAtRest) }

    public init(radios: RadioPair, launchSide: Side, log: any LogSink) {
        self.radios = .init(host: LoggedHostRadio(radios.host, log: log), client: LoggedClientRadio(radios.client, log: log))
        state = .init(side: launchSide, isAtRest: true)
        modeLog = ModeLog(sink: log)
        buildMode()
    }

    public func choose(_ side: Side) {
        guard isAtRest, state.side != side else { return }
        tearDownMode()
        state = .init(side: side, isAtRest: true)
        buildMode()
    }

    // Flow ownership and subscriptions belong at these two lifecycle boundaries.
    private func tearDownMode() { modeLog.tornDown(state.side) }
    private func buildMode() { modeLog.built(state.side) }
}

private struct ModeLog {
    let sink: any LogSink
    func built(_ side: Side) { sink.write(.init(category: .mode, message: "\(side.logName) built")) }
    func tornDown(_ side: Side) { sink.write(.init(category: .mode, message: "\(side.logName) tornDown")) }
    func state(_ state: AppModeState) { sink.write(.init(category: .mode, message: state.logDescription)) }
}

private extension Side {
    var logName: String {
        switch self {
        case .host: "host"
        case .client: "client"
        }
    }
}
